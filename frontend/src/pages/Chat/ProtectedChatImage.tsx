import { useEffect, useState } from 'react'
import { Box, CircularProgress } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'

import { fetchChatFile } from '@/api/chat'

interface Props {
  fileUrl: string
  alt: string
  sx?: SxProps<Theme>
}

const ProtectedChatImage = ({ fileUrl, alt, sx }: Props) => {
  const [objectUrl, setObjectUrl] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    let createdUrl = ''
    setObjectUrl('')
    setFailed(false)

    fetchChatFile(fileUrl)
      .then((blob) => {
        if (!active) return
        createdUrl = URL.createObjectURL(blob)
        setObjectUrl(createdUrl)
      })
      .catch(() => {
        if (active) setFailed(true)
      })

    return () => {
      active = false
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [fileUrl])

  if (failed) {
    return <Box sx={{ p: 2, opacity: 0.75, fontSize: '0.8rem' }}>Image unavailable</Box>
  }
  if (!objectUrl) {
    return (
      <Box sx={{ minHeight: 96, display: 'grid', placeItems: 'center' }}>
        <CircularProgress size={22} color="inherit" />
      </Box>
    )
  }

  return (
    <Box
      component="img"
      src={objectUrl}
      alt={alt}
      onClick={() => window.open(objectUrl, '_blank', 'noopener,noreferrer')}
      sx={{ cursor: 'pointer', ...sx }}
    />
  )
}

export default ProtectedChatImage
