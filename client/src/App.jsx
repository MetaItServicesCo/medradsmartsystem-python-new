import { BrowserRouter, Routes, Route } from "react-router-dom";
import MainLayout from "./layout/MainLayout";
import Dashboard from "./pages/Dashboard";

import Employees from "./pages/Employees";
import Attendance from "./pages/Attendance";
import Leaves from "./pages/Leaves";
import Chat from "./pages/Chat";
import ServiceRequest from "./pages/ServiceRequest";
import InventoryInspection from "./pages/InventoryInspection";
import Rental from "./pages/Rental";
import Reports from "./pages/Reports";
import Billing from "./pages/Billing";
import Leads from "./pages/Leads";
import Vendor from "./pages/Vendor";
import Documentation from "./pages/Documentation";
import SettingsPage from "./pages/SettingsPage";
import Facilities from "./pages/setup/Facilities";
import AddFacility from "./pages/setup/AddFacility";
import FacilitiesManagers from "./pages/setup/FacilitiesManagers";
import TestEquipments from "./pages/setup/TestEquipments";
import AddTestEquipment from "./pages/setup/AddTestEquipment";
import Modalities from "./pages/setup/Modalities";
import AddModality from "./pages/setup/Addmodality";
import InspectionForm from "./pages/setup/InspectionForm";
import AddInspection from "./pages/setup/AddInspection";
import ViewInspection from "./pages/setup/ViewInspection";
import EditInspection from "./pages/setup/EditInspection";
import Department from "./pages/setup/Department";
import Viewdepartment from "./pages/setup/Viewdepartment";
import AddDepartment from "./pages/setup/AddDepartment";
import FacilityTiers from "./pages/setup/FacilityTiers";
import EditFacility from "./pages/setup/EditFacility";
import ViewInventory from "./pages/setup/ViewInventory";
import ViewFacility from "./pages/setup/ViewFacility";
import FacilityUsers from "./pages/setup/FacilityUsers";
import AddTier from "./pages/setup/AddTier";
import EditTier from "./pages/setup/EditTier";
import InventoryList from "./pages/setup/InventoryList";
import CreateInventory from "./pages/setup/CreateInventory";
import Bulk from "./pages/setup/Bulk";
import ListEditInventory from "./pages/setup/ListEditInventory";
import ListViewInventory from "./pages/setup/ListViewInventory";
import ListServiceRequest from "./pages/setup/ListServiceRequest";
import UpdateUser from "./pages/setup/UpdateUser";
import CreateUser from "./pages/CreateUser";
import FacilityAddUser from "./pages/setup/FacilityAddUser";
import FacilityEditUser from "./pages/setup/FacilityEditUser";
import AddInventory from "./pages/setup/AddInventory";
import BulkUpload from "./pages/setup/BulkUpload";
import ViewUpdateUser from "./pages/setup/ViewUpdateUser";
import Users from "./pages/users/Users";
import EditUsers from "./pages/users/EditUsers";
import Rolls from "./pages/users/Rolls";
import SalesQoutation from "./pages/sales/SalesQoutation";
import AddQuotationPage from "./pages/sales/AddQuotationPage";
import SalesInvoice from "./pages/sales/SalesInvoice";
import UpdateModality from "./pages/setup/UpdateModality";
import SubModality from "./pages/setup/SubModality";
import UpdateSubmodality from "./pages/setup/UpdateSubmodality";
import AddRolls from "./pages/users/AddRolls";
import UpdateRoles from "./pages/users/UpdateRoles";
import ExcelUtlity from "./pages/setup/ExcelUtlity";
import CreateSubmodality from "./pages/setup/CreateSubmodality";
import PartsList from "./pages/inventory/PartsList";
import AddParts from "./pages/inventory/AddParts";
import EditParts from "./pages/inventory/EditParts";
import SalesList from "./pages/inventory/SalesList";
import AddSalesParts from "./pages/inventory/AddSalesParts";
import EditSalesParts from "./pages/inventory/EditSalesParts";
import RentalPartsList from "./pages/inventory/RentalPartsList";
import AddRentalPart from "./pages/inventory/AddRentalPart";
import EditRentalPart from "./pages/inventory/EditRentalPart";
import NewServiceRequest from "./pages/service-requist/NewServiceRequest";
import AddNewRequest from "./pages/service-requist/AddNewRequest";
import UpdateNewRequest from "./pages/service-requist/UpdateNewRequest";
import AssignTechnician from "./pages/service-requist/AssignTechnician";
import CreditCardAuthorization from "./pages/service-requist/CreditCardAuthorization";
import ServiceRequestsInProgress from "./pages/service-requist/ServiceRequestsInProgress";
import ViewServiceProgress from "./pages/service-requist/ViewServiceProgress";
import ReportActivityPage from "./pages/service-requist/ReportActivityPage";
import ServiceRequestCompleted from "./pages/service-requist/ServiceRequestCompleted";
import ServiceCompletedView from "./pages/service-requist/ServiceCompletedView";
import ServiceQoutation from "./pages/service-requist/ServiceQoutation";
import ServiceRequestHistory from "./pages/service-requist/ServiceRequestHistory";
import UpComingInspection from "./pages/pm-inspection/UpComingInspection";
import PendingInventories from "./pages/pm-inspection/PendingInventories";
import InstantInspection from "./pages/pm-inspection/InstantInspection";
import InspectionInProgress from "./pages/pm-inspection/InspectionInProgress";
import ViewInspectionProgress from "./pages/pm-inspection/ViewInspectionProgress";
import InspectionReport from "./pages/pm-inspection/InspectionReport";
import InspectionCompleted from "./pages/pm-inspection/InspectionCompleted";
import InspectionQoutation from "./pages/pm-inspection/InspectionQoutation";
import ViewInspectionQoutation from "./pages/pm-inspection/viewInspectionQoutation";
import InspectionHistory from "./pages/pm-inspection/InspectionHistory";

// Pages

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Dashboard />} />
          {/* Setup facility*/}
          <Route path="facilities" element={<Facilities />} />
          <Route path="facility/excel/utility" element={<ExcelUtlity />} />
          {/* Action Dropdown Routes */}
          <Route path="/add-tier/:facilityId" element={<AddTier />} />
          <Route path="/facility-tiers/:id" element={<FacilityTiers />} />
          <Route path="/edit-tier/:tierId" element={<EditTier />} />
          <Route path="/list-inventory/:id" element={<InventoryList />} />
          <Route path="inventory/create/:id" element={<CreateInventory />} />
          <Route path="inventory/bulk-upload" element={<Bulk />} />
          <Route
            path="/list-view-inventory/:id"
            element={<ListViewInventory />}
          />
          <Route
            path="/list-edit-inventory/:id"
            element={<ListEditInventory />}
          />
          <Route path="service-request/:id" element={<ListServiceRequest />} />
          <Route path="/edit-facility/:id" element={<EditFacility />} />
          <Route path="/edit-facility/users-update" element={<UpdateUser />} />
          <Route path="/view-inventory/:id" element={<ViewInventory />} />
          <Route path="/view-facility/:id" element={<ViewFacility />} />
          <Route path="/facility-users/:id" element={<FacilityUsers />} />
          <Route path="add-facility" element={<AddFacility />} />
          <Route path="facility-manager" element={<FacilitiesManagers />} />
          <Route path="testkits" element={<TestEquipments />} />
          <Route path="add-test-equipment" element={<AddTestEquipment />} />
          <Route path="modalities" element={<Modalities />} />
          <Route path="create-modality" element={<AddModality />} />
          <Route
            path="create-submodality/:id"
            element={<CreateSubmodality />}
          />
          <Route
            path="modality/update-modality/:id/update"
            element={<UpdateModality />}
          />

          <Route
            path="submodality/update-submodality/:id/update"
            element={<UpdateSubmodality />}
          />
          <Route path="modality/:id/submodality" element={<SubModality />} />
          <Route path="form" element={<InspectionForm />} />
          <Route path="add-inspection" element={<AddInspection />} />
          <Route path="view-inspection/:id" element={<ViewInspection />} />
          <Route path="edit-inspection/:id" element={<EditInspection />} />
          <Route path="department" element={<Department />} />
          <Route path="add-department" element={<AddDepartment />} />
          <Route path="view-department/:id" element={<Viewdepartment />} />
          <Route path="facility/add-user" element={<FacilityAddUser />} />
          <Route path="facility/edit-user/:id" element={<FacilityEditUser />} />
          <Route path="/facility/add-inventory" element={<AddInventory />} />
          <Route
            path="/facility/inventory/bulk-upload"
            element={<BulkUpload />}
          />
          <Route
            path="view-facility/users/update"
            element={<ViewUpdateUser />}
          />
          {/*===================== Inventory ======================*/}
          <Route path="parts-list" element={<PartsList />} />
          <Route path="add-part" element={<AddParts />} />
          <Route path="parts-list/edit-part/:id" element={<EditParts />} />
          <Route path="sales-parts" element={<SalesList />} />
          <Route path="sales-parts/add" element={<AddSalesParts />} />
          <Route path="sales-parts/add/:id" element={<EditSalesParts />} />
          <Route path="rental-parts" element={<RentalPartsList />} />
          <Route path="rental-parts/add" element={<AddRentalPart />} />
          <Route path="rental-parts/edit/:id" element={<EditRentalPart />} />
          {/*===================== End ======================*/}

          {/* ============================ service request ======================= */}

          <Route path="new-request" element={<NewServiceRequest />} />
          <Route path="new-request/add" element={<AddNewRequest />} />
          <Route path="new-request/edit/:id" element={<UpdateNewRequest />} />
          <Route path="new-request/assign/:id" element={<AssignTechnician />} />
          <Route path="in-progress" element={<ServiceRequestsInProgress />} />
          <Route
            path="in-progress/view/:id"
            element={<ViewServiceProgress />}
          />
          <Route
            path="in-progress/report/:id"
            element={<ReportActivityPage />}
          />
          <Route
            path="service-request-completed"
            element={<ServiceRequestCompleted />}
          />

          <Route
            path="service-request-completed/view-report/:id"
            element={<ServiceCompletedView />}
          />
          <Route path="service-quotation" element={<ServiceQoutation />} />
          <Route
            path="service-request-history"
            element={<ServiceRequestHistory />}
          />

          {/* ============================ end ======================= */}

          {/* ============================ PM Inspection ======================= */}

          <Route path="upcoming-inspections" element={<UpComingInspection />} />
          <Route
            path="upcoming-inspections/pending/:id"
            element={<PendingInventories />}
          />
          <Route path="instant-inspections" element={<InstantInspection />} />
          <Route
            path="inspection-in-progress"
            element={<InspectionInProgress />}
          />
          <Route
            path="inspection-in-progress/view-inspection-progress/:id"
            element={<ViewInspectionProgress />}
          />
          <Route
            path="inspection-in-progress/view-report/:id"
            element={<InspectionReport />}
          />
          <Route
            path="completed-inspections"
            element={<InspectionCompleted />}
          />
          <Route
            path="inspections-quotation"
            element={<InspectionQoutation />}
          />
          <Route
            path="inspections-quotation/view-inspection-quotation/:id"
            element={<ViewInspectionQoutation />}
          />

          <Route path="inspections-history" element={<InspectionHistory />} />
          {/* ============================ End PM Inspection ======================= */}

          {/* HR Management */}
          <Route path="employees" element={<Employees />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="leaves" element={<Leaves />} />
          {/*========= User Management ==============*/}
          <Route path="users" element={<Users />} />
          <Route path="users/edit-user/:id" element={<EditUsers />} />
          <Route path="user/rolls" element={<Rolls />} />
          <Route path="add-user" element={<CreateUser />} />
          <Route path="roles/add-role" element={<AddRolls />} />
          <Route path="roles/edit-role/:id/update" element={<UpdateRoles />} />
          {/*========= Other ==============*/}
          <Route path="chat" element={<Chat />} />
          <Route path="service-request" element={<ServiceRequest />} />
          <Route
            path="inventory-inspection"
            element={<InventoryInspection />}
          />
          {/* Sales route */}
          <Route path="/sales/sales-qoutation" element={<SalesQoutation />} />
          <Route
            path="/sales/add-quotation/:type"
            element={<AddQuotationPage />}
          />
          <Route path="/sales/convert-invoice/:id" element={<SalesInvoice />} />

          {/* end sales route  */}
          <Route path="rental" element={<Rental />} />
          <Route path="reports" element={<Reports />} />
          <Route path="billing" element={<Billing />} />
          <Route path="leads" element={<Leads />} />
          <Route path="vendor" element={<Vendor />} />
          <Route path="documentation" element={<Documentation />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route
          path="/new-request/auth/:id"
          element={<CreditCardAuthorization />}
        />
      </Routes>
    </BrowserRouter>
  );
}
