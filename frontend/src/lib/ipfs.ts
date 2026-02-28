import axios from 'axios'

const PINATA_API_KEY = import.meta.env.VITE_PINATA_API_KEY as string
const PINATA_SECRET_KEY = import.meta.env.VITE_PINATA_SECRET_KEY as string
const PINATA_JWT = import.meta.env.VITE_PINATA_JWT as string

interface UploadResult {
  ipfsHash: string
  pinSize: number
  timestamp: string
}

export async function uploadToIPFS(file: File): Promise<UploadResult> {
  const formData = new FormData()
  formData.append('file', file)

  // Add metadata
  const metadata = JSON.stringify({
    name: file.name,
    keyvalues: {
      uploadedAt: new Date().toISOString(),
      fileType: file.type,
      fileName: file.name,
      fileSize: file.size.toString(),
    },
  })
  formData.append('pinataMetadata', metadata)

  // Options
  const options = JSON.stringify({
    cidVersion: 1,
  })
  formData.append('pinataOptions', options)

  try {
    const response = await axios.post(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      formData,
      {
        maxBodyLength: Infinity,
        headers: {
          'Content-Type': `multipart/form-data`,
          'pinata_api_key': PINATA_API_KEY,
          'pinata_secret_api_key': PINATA_SECRET_KEY,
        },
      }
    )

    return {
      ipfsHash: response.data.IpfsHash,
      pinSize: response.data.PinSize,
      timestamp: response.data.Timestamp,
    }
  } catch (error: any) {
    console.error('Error uploading to IPFS:', error.response?.data || error.message)
    throw new Error(`Failed to upload to IPFS: ${error.response?.data?.error || error.message}`)
  }
}

export function getIPFSUrl(hash: string): string {
  // Use Pinata's dedicated gateway
  return `https://gateway.pinata.cloud/ipfs/${hash}`
}

export function getPublicIPFSUrl(hash: string): string {
  // Alternative public gateways
  return `https://ipfs.io/ipfs/${hash}`
}

export async function unpinFromIPFS(hash: string): Promise<void> {
  try {
    await axios.delete(`https://api.pinata.cloud/pinning/unpin/${hash}`, {
      headers: {
        'pinata_api_key': PINATA_API_KEY,
        'pinata_secret_api_key': PINATA_SECRET_KEY,
      },
    })
  } catch (error) {
    console.error('Error unpinning from IPFS:', error)
    throw error
  }
}

export async function getIPFSMetadata(hash: string) {
  try {
    const response = await axios.get(
      `https://api.pinata.cloud/data/pinList?hashContains=${hash}`,
      {
        headers: {
          'pinata_api_key': PINATA_API_KEY,
          'pinata_secret_api_key': PINATA_SECRET_KEY,
        },
      }
    )
    return response.data
  } catch (error) {
    console.error('Error fetching IPFS metadata:', error)
    throw error
  }
}

// Test connection
export async function testPinataConnection(): Promise<boolean> {
  try {
    const response = await axios.get('https://api.pinata.cloud/data/testAuthentication', {
      headers: {
        'pinata_api_key': PINATA_API_KEY,
        'pinata_secret_api_key': PINATA_SECRET_KEY,
      },
    })
    console.log('✅ Pinata connection successful:', response.data)
    return true
  } catch (error) {
    console.error('❌ Pinata connection failed:', error)
    return false
  }
}
