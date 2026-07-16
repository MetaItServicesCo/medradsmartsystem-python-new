import { Navigate, Routes, Route } from 'react-router-dom'
import ServiceRequestList from './ServiceRequestList'
import ServiceRequestDetail from './ServiceRequestDetail'

const ServiceRequests = () => {
  return (
    <Routes>
      <Route index element={<ServiceRequestList />} />
      <Route path="quotations" element={<Navigate to="/service-requests" replace />} />
      <Route path=":id" element={<ServiceRequestDetail />} />
    </Routes>
  )
}

export default ServiceRequests
