import { Routes, Route } from 'react-router-dom'
import ServiceRequestList from './ServiceRequestList'
import ServiceRequestDetail from './ServiceRequestDetail'
import ServiceQuotationsList from './ServiceQuotationsList'

const ServiceRequests = () => {
  return (
    <Routes>
      <Route index element={<ServiceRequestList />} />
      <Route path="quotations" element={<ServiceQuotationsList />} />
      <Route path=":id" element={<ServiceRequestDetail />} />
    </Routes>
  )
}

export default ServiceRequests
