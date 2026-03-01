import google.generativeai as genai
from supabase import create_client, Client
import requests
import io
import PyPDF2
from typing import List, Optional
from langfuse.decorators import observe

class RAGService:
    """
    Service for handling Retrieval Augmented Generation (RAG)
    using Supabase vector database
    """
    
    def __init__(self, supabase_url: str, supabase_key: str):
        self.supabase: Client = create_client(supabase_url, supabase_key)
    
    @observe()
    async def search_records(
        self, 
        user_id: str, 
        query: str,
        match_threshold: float = 0.5,
        match_count: int = 5
    ) -> str:
        """
        Search medical records using vector similarity
        
        Args:
            user_id: Patient ID
            query: Search query
            match_threshold: Minimum similarity score (0-1)
            match_count: Number of results to return
            
        Returns:
            Formatted context text from matched records
        """
        try:
            # Generate embedding for query
            query_embedding = genai.embed_content(
                model="models/gemini-embedding-001",
                content=query,
                task_type="retrieval_query",
                output_dimensionality=768
            )['embedding']
            
            # Search vector database
            response = self.supabase.rpc('match_document_chunks', {
                'query_embedding': query_embedding,
                'match_threshold': match_threshold,
                'match_count': match_count,
                'filter_user_id': user_id
            }).execute()
            
            # Format results
            if response.data:
                context_text = "\n\nRelevant Medical Records:\n"
                for item in response.data:
                    context_text += f"- {item['content']}\n"
                return context_text
            
            return ""
            
        except Exception as e:
            print(f"❌ RAG Search Error: {e}")
            return ""
    
    @observe()
    async def process_document(
        self,
        file_url: str,
        record_id: str,
        patient_id: str,
        chunk_size: int = 500
    ) -> dict:
        """
        Process a PDF document: extract text, create chunks, generate embeddings
        
        Args:
            file_url: URL of the PDF file
            record_id: Database record ID
            patient_id: Patient ID
            chunk_size: Size of text chunks
            
        Returns:
            Dictionary with processing results
        """
        try:
            print(f"📥 Downloading file from: {file_url}")
            
            # Download file
            response = requests.get(file_url)
            response.raise_for_status()
            content_type = response.headers.get('Content-Type', '').lower()
            
            full_text = ""
            
            if 'pdf' in content_type.lower() or 'image/' in content_type or file_url.lower().endswith(('.png', '.jpg', '.jpeg', '.pdf')):
                print(f"🖼️ Processing Document via Vision Model (MIME: {content_type})...")
                mime_type = 'application/pdf'
                if 'png' in content_type.lower() or file_url.lower().endswith('.png'):
                    mime_type = 'image/png'
                elif 'jpg' in content_type.lower() or 'jpeg' in content_type.lower() or file_url.lower().endswith(('.jpg', '.jpeg')):
                    mime_type = 'image/jpeg'
                
                vision_model = genai.GenerativeModel('gemini-2.5-flash')
                try:
                    vision_response = vision_model.generate_content([
                        "Extract all the text from this document. If there is handwriting, transcribe it accurately. If there are tables or forms, structure them clearly as text. Return ONLY the extracted text. If no text is found, return an empty string.",
                        {'mime_type': mime_type, 'data': response.content}
                    ])
                    full_text = vision_response.text
                    print(f"✅ Extracted {len(full_text)} characters from document")
                except Exception as ve:
                    print(f"❌ AI Extraction failed: {ve}")
                    raise ValueError(f"AI Document Extraction failed: {ve}")
            else:
                # Fallback purely as safety
                raise ValueError(f"Unsupported file type: {content_type}")
            
            if not full_text or not full_text.strip():
                raise ValueError("Could not extract any text from the file")
            
            # Save full text to records table
            try:
                self.supabase.table("records").update({
                    "extracted_text": full_text
                }).eq("id", record_id).execute()
                print("✅ Saved full text to records table")
            except Exception as e:
                print(f"⚠️ Could not save full text: {e}")
            
            # Create chunks
            chunks = [
                full_text[i:i+chunk_size] 
                for i in range(0, len(full_text), chunk_size)
            ]
            
            print(f"📄 Created {len(chunks)} chunks, generating embeddings...")
            
            # Generate embeddings and prepare for batch insert
            rows_to_insert = []
            for chunk in chunks:
                embedding_result = genai.embed_content(
                    model="models/gemini-embedding-001",
                    content=chunk,
                    task_type="retrieval_document",
                    output_dimensionality=768
                )
                
                rows_to_insert.append({
                    "record_id": record_id,
                    "patient_id": patient_id,
                    "content": chunk,
                    "embedding": embedding_result['embedding']
                })
            
            # Batch insert to database
            if rows_to_insert:
                self.supabase.table("document_chunks").insert(rows_to_insert).execute()
                print(f"✅ Inserted {len(rows_to_insert)} chunks into database")
            
            return {
                "chunks": len(rows_to_insert),
                "text_length": len(full_text)
            }
            
        except Exception as e:
            print(f"❌ Document Processing Error: {e}")
            raise
    
    async def get_patient_records(self, user_id: str) -> List[str]:
        """
        Get all text records for a patient (for health analysis)
        
        Args:
            user_id: Patient ID
            
        Returns:
            List of text records
        """
        try:
            # Try document_chunks first
            print(f"🔍 Fetching chunks for user: {user_id}")
            response = self.supabase.table('document_chunks')\
                .select('content')\
                .eq('patient_id', user_id)\
                .execute()
            
            if response.data:
                print(f"✅ Found {len(response.data)} chunks")
                if len(response.data) > 0:
                     print(f"📄 First chunk preview: {response.data[0].get('content', '')[:100]}...")
                return [item['content'] for item in response.data if item.get('content')]
            
            print("⚠️ No chunks found, trying records fallback...")
            
            # Fallback to records.extracted_text
            fallback = self.supabase.table('records')\
                .select('extracted_text')\
                .eq('patient_id', user_id)\
                .execute()
            
            if fallback.data:
                print(f"✅ Found {len(fallback.data)} records in fallback")
                return [r['extracted_text'] for r in fallback.data if r.get('extracted_text')]
            
            print("❌ No records found at all")
            return []
            
        except Exception as e:
            print(f"❌ Error fetching patient records: {e}")
            return []

    async def get_patient_records_with_dates(self, user_id: str) -> List[dict]:
        """
        Get all text records with timestamps for trend analysis
        """
        try:
            # Fetch from records table to get original documents with dates
            response = self.supabase.table('records')\
                .select('created_at, extracted_text')\
                .eq('patient_id', user_id)\
                .order('created_at', desc=False)\
                .execute()
            
            if response.data:
                return [
                    {
                        "date": item['created_at'], 
                        "text": item['extracted_text']
                    } 
                    for item in response.data 
                    if item.get('extracted_text')
                ]
            
            return []
            
        except Exception as e:
            print(f"❌ Error fetching patient records with dates: {e}")
            return []