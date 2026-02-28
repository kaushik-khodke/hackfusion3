from elevenlabs import ElevenLabs, VoiceSettings
import re
from typing import Optional

class VoiceService:
    """
    Service for handling ElevenLabs voice synthesis with empathic delivery
    """
    
    def __init__(self, api_key: str):
        self.client = ElevenLabs(api_key=api_key)
        
        # Voice IDs for different languages and emotions
        # These are ElevenLabs pre-made voices optimized for natural conversation
        self.voices = {
            "en": "EXAVITQu4vr4xnSDxMaL",  # Sarah - Warm, empathetic female voice
            "hi": "pNInz6obpgDQGcFmaJgB",  # Adam - Clear, friendly voice
            "mr": "pNInz6obpgDQGcFmaJgB",  # Adam works well for Marathi too
        }
        
        # Voice settings optimized for maximum empathy and expressiveness
        self.empathic_settings = VoiceSettings(
            stability=0.5,        # Balanced stability (was 0.3)
            similarity_boost=0.75,  # Voice consistency
            style=0.5,            # Balanced style (was 0.8)
            use_speaker_boost=True
        )
    
    def _clean_text_for_speech(self, text: str) -> str:
        """
        Clean and enhance text for more empathic, natural speech
        """
        # Remove markdown formatting
        cleaned = text.replace("###", "").replace("**", "").replace("*", "")
        
        # Remove emojis (they don't speak well)
        cleaned = re.sub(r'[\U00010000-\U0010ffff]', '', cleaned)
        
        # Add natural pauses for empathy (replace certain punctuation with longer pauses)
        cleaned = cleaned.replace("?", "?.. ")  # Pause after questions
        cleaned = cleaned.replace("!", "!.. ")  # Pause after excitement
        cleaned = cleaned.replace(". ", "... ")  # Natural pause after sentences
        
        # Convert bullet points to natural pauses
        cleaned = cleaned.replace("- ", ".. ")
        cleaned = cleaned.replace("• ", ".. ")
        
        # Clean up extra whitespace
        cleaned = " ".join(cleaned.split())
        
        return cleaned.strip()
    
    async def synthesize_empathic(
        self, 
        text: str, 
        language: str = "en"
    ) -> Optional[bytes]:
        """
        Synthesize text to speech with empathic voice settings
        
        Args:
            text: Text to convert to speech
            language: Language code (en, hi)
            
        Returns:
            Audio data as bytes (MP3 format)
        """
        try:
            # Clean text for speech
            clean_text = self._clean_text_for_speech(text)
            
            if not clean_text:
                print("⚠️ No text to synthesize after cleaning")
                return None
            
            # Select appropriate voice
            voice_id = self.voices.get(language, self.voices["en"])
            
            print(f"🎤 Synthesizing voice (lang: {language}, length: {len(clean_text)} chars)")
            
            # Generate audio with streaming for faster response
            audio_generator = self.client.text_to_speech.convert(
                voice_id=voice_id,
                text=clean_text,
                model_id="eleven_multilingual_v2",  # Supports multiple languages
                voice_settings=self.empathic_settings,
            )
            
            # Collect audio chunks
            audio_data = b""
            for chunk in audio_generator:
                if chunk:
                    audio_data += chunk
            
            print(f"✅ Voice generated: {len(audio_data)} bytes")
            return audio_data
            
        except Exception as e:
            print(f"Voice synthesis error: {e}")
            try:
                with open("error.txt", "w") as f:
                    f.write(f"VoiceService Error: {str(e)}")
            except:
                pass
            return None
    
    async def synthesize_streaming(
        self,
        text: str,
        language: str = "en"
    ):
        """
        Stream audio in chunks for lower latency (generator function)
        """
        try:
            clean_text = self._clean_text_for_speech(text)
            voice_id = self.voices.get(language, self.voices["en"])
            
            audio_generator = self.client.text_to_speech.convert(
                voice_id=voice_id,
                text=clean_text,
                model_id="eleven_multilingual_v2",
                voice_settings=self.empathic_settings,
            )
            
            for chunk in audio_generator:
                if chunk:
                    yield chunk
                    
        except Exception as e:
            print(f"Streaming error: {e}")
            yield b""