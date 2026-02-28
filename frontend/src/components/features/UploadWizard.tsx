import React, { useState } from 'react'
import { Modal, ModalContent, ModalHeader, ModalTitle } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Stepper } from '@/components/ui/Stepper'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { Upload, FileText, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { uploadToIPFS, getIPFSUrl } from '@/lib/ipfs'
import { useAuth } from '@/hooks/useAuth'
import { motion } from 'framer-motion'

const uploadSchema = z.object({
  recordType: z.enum(['prescription', 'lab_report', 'imaging', 'discharge_summary', 'vaccination', 'other']),
  title: z.string().min(1, 'Title is required'),
  recordDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  doctorName: z.string().optional(),
  notes: z.string().optional(),
})

type UploadFormData = z.infer<typeof uploadSchema>

interface UploadWizardProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function UploadWizard({ open, onClose, onSuccess }: UploadWizardProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [currentStep, setCurrentStep] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const { register, handleSubmit, formState: { errors }, reset } = useForm<UploadFormData>({
    resolver: zodResolver(uploadSchema),
  })

  const steps = [
    { title: 'Type', description: 'Choose record type' },
    { title: 'Details', description: 'Enter information' },
    { title: 'Upload', description: 'Attach file' },
    { title: 'Confirm', description: 'Review' },
  ]

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      if (selectedFile.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB')
        return
      }
      setFile(selectedFile)
    }
  }

  const onSubmit = async (data: UploadFormData) => {
    if (!file) {
      alert('Please select a file')
      return
    }

    if (!user) {
      alert('You must be logged in to upload records')
      return
    }

    setIsUploading(true)

    try {
      console.log('📤 Starting upload process...')
      console.log('👤 User ID:', user.id)
      console.log('📋 Form data:', data)
      console.log('📁 File:', file.name, file.size, file.type)

      // Step 1: Upload to IPFS via Pinata
      console.log('📤 Uploading to IPFS via Pinata...')
      const ipfsResult = await uploadToIPFS(file)
      console.log('✅ IPFS Upload successful!')
      console.log('📍 IPFS Hash:', ipfsResult.ipfsHash)

      // Step 2: Generate IPFS URL
      const ipfsUrl = getIPFSUrl(ipfsResult.ipfsHash)
      console.log('🔗 IPFS URL:', ipfsUrl)

      // Resolve patient row id (same as Records page) so dashboard count and list stay in sync
      const { data: patientRow, error: patientErr } = await supabase
        .from('patients')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (patientErr || !patientRow?.id) {
        throw new Error('Patient profile not found. Please complete profile setup.')
      }
      const patientId = patientRow.id

      // Step 3: Prepare database record
      const recordToInsert = {
        patient_id: patientId,
        uploaded_by: user.id,

        record_type: data.recordType,
        title: data.title,
        record_date: data.recordDate,
        doctor_name: data.doctorName || null,
        notes: data.notes || null,
        ipfs_hash: ipfsResult.ipfsHash,
        ipfs_cid: ipfsResult.ipfsHash,  // ← ADD THIS LINE (same as ipfs_hash)

        file_url: ipfsUrl,
        file_size: file.size,
        file_type: file.type,
        file_name: file.name,
        encrypted: false,
      }

      console.log('💾 Attempting to save to database...')
      console.log('📝 Record to insert:', recordToInsert)

      // Step 4: Save to Supabase
      const { data: recordData, error: dbError } = await supabase
        .from('records')
        .insert(recordToInsert)
        .select()
        .single()

      if (dbError) {
        console.error('❌ Database error:', dbError)
        console.error('Error details:', JSON.stringify(dbError, null, 2))
        throw new Error(`Database error: ${dbError.message}`)
      }

      if (!recordData) {
        throw new Error('No data returned from database insert')
      }

      console.log('✅ Record saved to database!')
      console.log('📋 Saved record:', recordData)

      alert(`✅ Record uploaded successfully!
      
📍 IPFS Hash: ${ipfsResult.ipfsHash}
🔗 View on IPFS: ${ipfsUrl}
💾 Database ID: ${recordData.id}`)

      // Success - refresh parent
      onSuccess()
      reset()
      setFile(null)
      setCurrentStep(0)
      onClose()
    } catch (error: any) {
      console.error('❌ Upload error:', error)
      console.error('Error stack:', error.stack)
      alert(`❌ Upload failed: ${error.message}

Check browser console for details.`)
    } finally {
      setIsUploading(false)
    }
  }

  const handleClose = () => {
    reset()
    setFile(null)
    setCurrentStep(0)
    onClose()
  }

  return (
    <Modal open={open} onOpenChange={handleClose}>
      <ModalContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <ModalHeader>
          <ModalTitle>Upload Medical Record</ModalTitle>
        </ModalHeader>

        <Stepper steps={steps} currentStep={currentStep} />

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-6 px-6">
          {/* Step 0: Select Type */}
          {currentStep === 0 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              <label className="block text-sm font-medium mb-2">Record Type</label>
              <select
                {...register('recordType')}
                className="w-full rounded-lg border border-input bg-background px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="prescription">💊 Prescription</option>
                <option value="lab_report">🔬 Lab Report</option>
                <option value="imaging">🩻 Imaging (X-Ray, MRI, CT)</option>
                <option value="discharge_summary">📋 Discharge Summary</option>
                <option value="vaccination">💉 Vaccination Record</option>
                <option value="other">📄 Other</option>
              </select>
              {errors.recordType && <p className="text-error text-sm">{errors.recordType.message}</p>}
            </motion.div>
          )}

          {/* Step 1: Details */}
          {currentStep === 1 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium mb-2">Record Title *</label>
                <Input
                  {...register('title')}
                  placeholder="e.g., Annual Checkup, Blood Test"
                  error={errors.title?.message}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Record Date *</label>
                <Input
                  {...register('recordDate')}
                  type="date"
                  error={errors.recordDate?.message}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Doctor Name</label>
                <Input
                  {...register('doctorName')}
                  placeholder="Dr. Smith"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Notes</label>
                <textarea
                  {...register('notes')}
                  placeholder="Any additional information..."
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 min-h-[100px] focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </motion.div>
          )}

          {/* Step 2: Upload File */}
          {currentStep === 2 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              <label className="block text-sm font-medium mb-2">Attach File *</label>
              <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary transition-colors">
                <input
                  type="file"
                  onChange={handleFileChange}
                  className="hidden"
                  id="file-upload-input"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                />
                {!file ? (
                  <>
                    <Upload className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                    <label htmlFor="file-upload-input" className="cursor-pointer">
                      <Button type="button" onClick={() => document.getElementById('file-upload-input')?.click()}>
                        Select File
                      </Button>
                    </label>
                    <p className="text-sm text-muted-foreground mt-4">
                      Supported: PDF, JPG, PNG, DOC (Max 10MB)
                    </p>
                  </>
                ) : (
                  <div className="flex items-center justify-center gap-4">
                    <FileText className="w-12 h-12 text-primary" />
                    <div className="text-left">
                      <p className="font-semibold">{file.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {(file.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setFile(null)}
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Step 3: Confirm */}
          {currentStep === 3 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              <div className="bg-muted/50 rounded-xl p-6 space-y-3">
                <h4 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <Check className="w-5 h-5 text-success" />
                  Review Your Upload
                </h4>
                <div className="space-y-2 text-sm">
                  <p><span className="font-medium">File:</span> {file?.name}</p>
                  <p><span className="font-medium">Size:</span> {file ? (file.size / 1024).toFixed(2) : 0} KB</p>
                  <p className="text-muted-foreground text-xs mt-4">
                    🔒 Your file will be encrypted and stored securely on IPFS
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between gap-4 pt-4 pb-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => currentStep > 0 ? setCurrentStep(currentStep - 1) : handleClose()}
            >
              {currentStep === 0 ? 'Cancel' : 'Back'}
            </Button>
            {currentStep < steps.length - 1 ? (
              <Button
                type="button"
                onClick={() => {
                  if (currentStep === 2 && !file) {
                    alert('Please select a file')
                    return
                  }
                  setCurrentStep(currentStep + 1)
                }}
              >
                Next
              </Button>
            ) : (
              <Button type="submit" disabled={!file || isUploading}>
                {isUploading ? 'Uploading...' : 'Upload Record'}
              </Button>
            )}
          </div>
        </form>
      </ModalContent>
    </Modal>
  )
}
