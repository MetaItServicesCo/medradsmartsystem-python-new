import { Box } from '@mui/material'

const Landing = () => (
  <Box
    component="iframe"
    title="MedRad Smart System landing page"
    src="/landing/index.html"
    sx={{
      display: 'block',
      width: '100%',
      minHeight: '100dvh',
      border: 0,
      bgcolor: '#EFEAFF',
    }}
  />
)

export default Landing
