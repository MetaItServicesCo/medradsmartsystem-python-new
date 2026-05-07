import { Routes, Route } from 'react-router-dom'
import FacilityList from './FacilityList'

const Facilities = () => {
  return (
    <Routes>
      <Route index element={<FacilityList />} />
    </Routes>
  )
}

export default Facilities
