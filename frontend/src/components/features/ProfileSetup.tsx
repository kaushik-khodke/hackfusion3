import React, { useState } from 'react'
import { Modal, ModalContent, ModalHeader, ModalTitle } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { motion } from 'framer-motion'
import { User, Phone, Calendar, Droplet, AlertCircle } from 'lucide-react'

const profileSchema = z.object({
  full_name: z.string().min(2, 'Full name is required'),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian mobile number'),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  blood_group: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
  emergency_contact: z.string().regex(/^[6-9]\d{9}$/, 'Invalid mobile number'),
  emergency_name: z.string().min(2, 'Emergency contact name required'),
  address: z.string().min(2, 'Complete address required'),
  city: z.string().min(2, 'City required'),
  state: z.string().min(2, 'State required'),
  pincode: z.string().regex(/^\d{6}$/, 'Invalid pincode'),
})

type ProfileFormData = z.infer<typeof profileSchema>

interface ProfileSetupProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function ProfileSetup({ open, onClose, onSuccess }: ProfileSetupProps) {
  const { user } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  const { register, handleSubmit, formState: { errors }, watch, trigger } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
  })

  // Validate step before moving to next
  const handleNextStep = async () => {
    let fieldsToValidate: (keyof ProfileFormData)[] = []
    if (currentStep === 0) {
      fieldsToValidate = ['full_name', 'phone', 'date_of_birth', 'address', 'city', 'state', 'pincode']
    } else if (currentStep === 1) {
      fieldsToValidate = ['blood_group']
    }

    const isValid = await trigger(fieldsToValidate)
    if (isValid) {
      setCurrentStep(currentStep + 1)
    }
  }

  const onSubmit = async (data: ProfileFormData) => {
    if (!user) return
    setIsSubmitting(true)

    try {
      // Generate 10-digit UHID
      const timestamp = Date.now().toString().slice(-6)
      const userHash = user.id.replace(/-/g, '').slice(0, 4).toUpperCase()
      const uhid = `${userHash}${timestamp}`

      // 1) Fallback for manually added users: Ensure a main 'profiles' row exists
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()

      if (!existingProfile) {
        // If a doctor or hospital admin added them directly in Supabase missing metadata
        const { error: insertProfileErr } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            role: 'patient',
            full_name: data.full_name,
            phone: data.phone,
          })
        if (insertProfileErr) throw insertProfileErr
      }

      // 2) Insert or update patient profile metadata
      const { error: profileError } = await supabase
        .from('patients')
        .upsert({
          id: user.id,
          user_id: user.id,
          uhid: uhid,
          full_name: data.full_name,
          phone: data.phone,
          date_of_birth: data.date_of_birth,
          blood_group: data.blood_group,
          emergency_contact: data.emergency_contact,
          emergency_name: data.emergency_name,
          address: data.address,
          city: data.city,
          state: data.state,
          pincode: data.pincode,
          profile_completed: true,
          created_at: new Date().toISOString(),
        })

      if (profileError) throw profileError

      alert('✅ Profile completed successfully!\n\n🎴 Your Smart Health Card is now ready!')
      onSuccess()
      onClose()
    } catch (error: any) {
      console.error('Profile setup error:', error)
      alert(`❌ Failed to save profile: ${error.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const steps = [
    { title: 'Personal Info', icon: User },
    { title: 'Health Details', icon: Droplet },
    { title: 'Emergency Contact', icon: AlertCircle },
  ]

  return (
    <Modal open={open} onOpenChange={onClose}>
      <ModalContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <ModalHeader>
          <ModalTitle>Complete Your Health Profile</ModalTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Fill all details to generate your Smart Health Card
          </p>
        </ModalHeader>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-4 px-6 py-4 border-b">
          {steps.map((step, index) => (
            <div key={index} className="flex items-center gap-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${index <= currentStep
                ? 'bg-primary text-white'
                : 'bg-muted text-muted-foreground'
                }`}>
                <step.icon className="w-5 h-5" />
              </div>
              <span className={`text-sm font-medium ${index <= currentStep ? 'text-foreground' : 'text-muted-foreground'
                }`}>
                {step.title}
              </span>
              {index < steps.length - 1 && (
                <div className="w-8 h-[2px] bg-muted mx-2" />
              )}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 px-6 py-4">
          {/* Step 0: Personal Info */}
          {currentStep === 0 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium mb-2">Full Name *</label>
                <Input
                  {...register('full_name')}
                  placeholder="Enter your full name"
                  error={errors.full_name?.message}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Phone Number *</label>
                  <Input
                    {...register('phone')}
                    placeholder="9876543210"
                    maxLength={10}
                    error={errors.phone?.message}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Date of Birth *</label>
                  <Input
                    {...register('date_of_birth')}
                    type="date"
                    error={errors.date_of_birth?.message}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Address *</label>
                <textarea
                  {...register('address')}
                  placeholder="Complete address"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 min-h-[80px] focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {errors.address && (
                  <p className="text-sm text-error mt-1">{errors.address.message}</p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">City *</label>
                  <Input {...register('city')} error={errors.city?.message} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">State *</label>
                  <Input {...register('state')} error={errors.state?.message} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Pincode *</label>
                  <Input
                    {...register('pincode')}
                    placeholder="400001"
                    maxLength={6}
                    error={errors.pincode?.message}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 1: Health Details */}
          {currentStep === 1 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium mb-2">Blood Group *</label>
                <select
                  {...register('blood_group')}
                  className="w-full rounded-lg border border-input bg-background px-3 py-3 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select Blood Group</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                </select>
                {errors.blood_group && (
                  <p className="text-sm text-error mt-1">{errors.blood_group.message}</p>
                )}
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                  <Droplet className="w-4 h-4 text-blue-600" />
                  Why Blood Group?
                </h4>
                <p className="text-xs text-muted-foreground">
                  Your blood group is critical information for emergency medical care.
                  It will be displayed prominently on your Smart Health Card.
                </p>
              </div>
            </motion.div>
          )}

          {/* Step 2: Emergency Contact */}
          {currentStep === 2 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium mb-2">Emergency Contact Name *</label>
                <Input
                  {...register('emergency_name')}
                  placeholder="Name of emergency contact person"
                  error={errors.emergency_name?.message}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Emergency Contact Number *</label>
                <Input
                  {...register('emergency_contact')}
                  placeholder="9876543210"
                  maxLength={10}
                  error={errors.emergency_contact?.message}
                />
              </div>

              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-4">
                <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  Emergency Contact
                </h4>
                <p className="text-xs text-muted-foreground">
                  This person will be contacted in case of medical emergency.
                  Please ensure the number is correct and accessible.
                </p>
              </div>
            </motion.div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between gap-4 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => currentStep > 0 ? setCurrentStep(currentStep - 1) : onClose()}
            >
              {currentStep === 0 ? 'Cancel' : 'Back'}
            </Button>

            {currentStep < steps.length - 1 ? (
              <Button
                type="button"
                onClick={handleNextStep}
              >
                Next
              </Button>
            ) : (
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Generating Card...' : 'Generate Smart Health Card'}
              </Button>
            )}
          </div>
        </form>
      </ModalContent>
    </Modal>
  )
}
