import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { VerifyPinDialog } from './VerifyPinDialog'
import { Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { motion } from 'framer-motion'

export function ConsentRequestsList() {
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null)

  useEffect(() => {
    fetchRequests()
  }, [])

  const fetchRequests = async () => {
    const { data: user } = await supabase.auth.getUser()
    
    const { data, error } = await supabase
      .from('consent_requests')
      .select(`
        *,
        doctors (name, specialization)
      `)
      .eq('patient_id', user.user?.id)
      .order('created_at', { ascending: false })

    if (!error) {
      setRequests(data || [])
    }
    setLoading(false)
  }

  const handleReject = async (requestId: string) => {
    if (!confirm('Are you sure you want to reject this request?')) return

    await supabase
      .from('consent_requests')
      .update({ status: 'rejected', approved_at: new Date().toISOString() })
      .eq('id', requestId)

    fetchRequests()
  }

  if (loading) return <div>Loading...</div>

  return (
    <>
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Consent Requests ({requests.filter(r => r.status === 'pending').length} pending)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No consent requests
            </p>
          ) : (
            <div className="space-y-3">
              {requests.map((request, index) => (
                <motion.div
                  key={request.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`p-4 rounded-xl border-2 ${
                    request.status === 'pending' 
                      ? 'border-warning bg-warning/5'
                      : request.status === 'approved'
                      ? 'border-success bg-success/5'
                      : 'border-error bg-error/5'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {request.status === 'pending' && <Clock className="w-4 h-4 text-warning" />}
                        {request.status === 'approved' && <CheckCircle className="w-4 h-4 text-success" />}
                        {request.status === 'rejected' && <XCircle className="w-4 h-4 text-error" />}
                        <p className="font-semibold">
                          Dr. {request.doctors?.name || 'Unknown'}
                        </p>
                      </div>
                      <p className="text-sm text-muted-foreground mb-1">
                        {request.doctors?.specialization}
                      </p>
                      <p className="text-sm mb-2">
                        <span className="font-medium">Access:</span> {request.access_type}
                      </p>
                      <p className="text-sm mb-2">
                        <span className="font-medium">Reason:</span> {request.reason}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Requested: {new Date(request.created_at).toLocaleString()}
                      </p>
                    </div>
                    
                    {request.status === 'pending' && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => setSelectedRequest(request.id)}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleReject(request.id)}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedRequest && (
        <VerifyPinDialog
          open={!!selectedRequest}
          onClose={() => setSelectedRequest(null)}
          consentRequestId={selectedRequest}
          onSuccess={fetchRequests}
        />
      )}
    </>
  )
}
