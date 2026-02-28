import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Check, X, Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/utils'
import { motion } from 'framer-motion'

interface ConsentRequest {
  id: string
  doctor_name: string
  hospital: string
  reason: string
  access_type: 'read' | 'read_write'
  created_at: string
  expires_at: string | null
  status: 'pending' | 'approved' | 'denied'
}

interface ConsentInboxProps {
  requests: ConsentRequest[]
  onApprove: (id: string) => void
  onDeny: (id: string) => void
}

export function ConsentInbox({ requests, onApprove, onDeny }: ConsentInboxProps) {
  const { t } = useTranslation()

  const pendingRequests = requests.filter(r => r.status === 'pending')
  const approvedRequests = requests.filter(r => r.status === 'approved')

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5" />
          {t('consent.pending')} ({pendingRequests.length})
        </h3>
        {pendingRequests.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('consent.no_requests')}</p>
        ) : (
          <div className="space-y-3">
            {pendingRequests.map((request, index) => (
              <motion.div
                key={request.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card hover>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-semibold">{request.doctor_name}</h4>
                        <p className="text-sm text-muted-foreground">{request.hospital}</p>
                      </div>
                      <Badge
                        variant="default"
                        className={request.access_type === 'read_write' ? 'bg-amber-500 hover:bg-amber-600' : ''}
                      >
                        {request.access_type === 'read_write' ? 'Read & Write' : 'Read Only'}
                      </Badge>
                    </div>
                    <p className="text-sm mb-3">{request.reason}</p>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">
                        {t('consent.requested_at')}: {formatDate(request.created_at)}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onDeny(request.id)}
                          className="text-red-500 border-red-500 hover:bg-red-500/10"
                        >
                          <X className="w-4 h-4 mr-1" />
                          {t('consent.deny')}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => onApprove(request.id)}
                          variant="default"
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <Check className="w-4 h-4 mr-1" />
                          {t('consent.approve')}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">{t('consent.approved')} ({approvedRequests.length})</h3>
        <div className="space-y-3">
          {approvedRequests.map((request) => (
            <Card key={request.id}>
              <CardContent className="p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-semibold">{request.doctor_name}</h4>
                    <p className="text-sm text-muted-foreground">
                      {request.expires_at ? `Expires: ${formatDate(request.expires_at)}` : 'No expiry'}
                    </p>
                  </div>
                  <Badge variant="default" className="bg-green-600 hover:bg-green-700">Active</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
