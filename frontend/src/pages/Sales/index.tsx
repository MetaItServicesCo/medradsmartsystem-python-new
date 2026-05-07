import { Routes, Route } from 'react-router-dom'
import Billing from './Billing'
import { Box, Typography } from '@mui/material'

const SalesHome = () => (
  <Box>
    <Typography variant="h4">Sales Management</Typography>
    <Typography>Sales and quotations will be implemented here</Typography>
  </Box>
)

const Sales = () => {
  return (
    <Routes>
      <Route index element={<SalesHome />} />
      <Route path="billing" element={<Billing />} />
    </Routes>
  )
}

export default Sales
