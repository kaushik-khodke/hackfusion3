import React from 'react'
import { Modal, ModalContent, ModalHeader, ModalTitle } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Download, FileText, Calendar, User } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface Record {
  id: string
  title: string
  record_type: string
  record_date: string
  doctor_name?: string
  notes?: string
  ipfs_cid: string
  file_size_bytes?: number
  created_at: string
}

interface RecordViewerProps {
  record: Record | null
  open: boolean
  onClose: () => void
}

export function RecordViewer({ record, open, onClose }: RecordViewerProps) {
  if (!record) return null

  const handleDownload = () => {
    // In production, decrypt and download from IPFS
    window.open(`https://gateway.pinata.cloud/ipfs/${record.ipfs_cid}`, '_blank')
  }

  return (
    <Modal open={open} onOpenChange={onClose}>
      <ModalContent className="max-w-2xl">
        <ModalHeader>
          <div className="flex items-center justify-between">
            <ModalTitle>{record.title}</ModalTitle>
            <Badge>{record.record_type}</Badge>
          </div>
        </ModalHeader>

        <div className="space-y-6">
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Date:</span>
              <span className="font-medium">{formatDate(record.record_date)}</span>
            </div>

            {record.doctor_name && (
              <div className="flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Doctor:</span>
                <span className="font-medium">{record.doctor_name}</span>
              </div>
            )}

            <div className="flex items-center gap-2 text-sm col-span-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">File Size:</span>
              <span className="font-medium">
                {record.file_size_bytes ? `${(record.file_size_bytes / 1024).toFixed(2)} KB` : 'N/A'}
              </span>
            </div>
          </div>

          {/* Notes */}
          {record.notes && (
            <div>
              <h4 className="font-semibold mb-2">Notes</h4>
              <p className="text-sm text-muted-foreground bg-muted rounded-lg p-4">
                {record.notes}
              </p>
            </div>
          )}

          {/* IPFS Info */}
          <div className="bg-muted/50 rounded-lg p-4">
            <h4 className="font-semibold mb-2 text-sm">Storage Information</h4>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">IPFS CID:</span>
                <code className="ml-2 bg-background px-2 py-0.5 rounded">
                  {record.ipfs_cid}
                </code>
              </p>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Uploaded:</span> {formatDate(record.created_at)}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button onClick={handleDownload} className="flex-1">
              <Download className="w-4 h-4 mr-2" />
              Download File
            </Button>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            🔒 This file is encrypted and stored securely on IPFS
          </p>
        </div>
      </ModalContent>
    </Modal>
  )
}
