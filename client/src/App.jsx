import { BrowserRouter, Routes, Route } from "react-router-dom";
import MainLayout from "./layout/MainLayout";
import Dashboard from "./pages/Dashboard";

import Employees from "./pages/Employees";
import Attendance from "./pages/Attendance";
import Leaves from "./pages/Leaves";
import ServiceRequest from "./pages/ServiceRequest";
import InventoryInspection from "./pages/InventoryInspection";

import Leads from "./pages/Leads";
import Vendor from "./pages/vendor/Vendor";
import Documentation from "./pages/Documentation";
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
import EditSaleParts from "./pages/sales/EditSaleParts";
import ViewSales from "./pages/sales/ViewSales";
import SalesCreditCard from "./pages/sales/SalesCreditCard";
import SalesPartsInvoice from "./pages/sales/SalesPartsInvoice";
import SalesInvoicePay from "./pages/sales/SalesInvoicePay";
import EditInvoicePay from "./pages/sales/EditInvoicePay";
import SalesInvoiceView from "./pages/sales/SalesInvoiceView";
import SalesInProgress from "./pages/sales/SalesInProgress";
import SalesCompleted from "./pages/sales/SalesCompleted";
import SalesHistory from "./pages/sales/SalesHistory";
import RentalQoutation from "./pages/rentals/RentalQoutation";
import AddRentalQuotation from "./pages/rentals/AddRentalQuotation";
import RentalConvertInvoice from "./pages/rentals/RentalConvertInvoice";
import RentalQoutationView from "./pages/rentals/RentalQoutationView";
import RentalPartEdit from "./pages/rentals/RentalPartEdit";
import RentalCreditCard from "./pages/rentals/RentalCreditCard";
import RentalPartBuy from "./pages/rentals/RentalPartBuy";
import RentalPartInvoices from "./pages/rentals/RentalPartInvoices";
import RentalInProgress from "./pages/rentals/RentalInProgress";
import RentalCompleted from "./pages/rentals/RentalCompleted";
import RentalHistory from "./pages/rentals/RentalHistory";
import ServiceReport from "./pages/reports/ServiceReport";
import ServiceReportPrint from "./pages/reports/ServiceReportPrint";
import ReportInspection from "./pages/reports/ReportInspection";
import ViewReportInspection from "./pages/reports/ViewReportInspection";
import InspectionPrintReport from "./pages/reports/InspectionPrintReport";
import InspectionReportActivity from "./pages/reports/InspectionReportActivity";
import FacilityInventoryReport from "./pages/reports/FacilityInventoryReport";
import InspectionRangeReport from "./pages/reports/InspectionRangeReport";
import EquipmentServiceHistory from "./pages/reports/EquipmentServiceHistory";
import BillingsInvoice from "./pages/billings/BillingsInvoice";
import BillingInstallment from "./pages/billings/BillingInstallment";
import BillingReport from "./pages/billings/BillingReport";
import BillingRevenueReports from "./pages/billings/BillingRevenueReports";
import CCAuthForms from "./pages/billings/CCAuthForms";
import InstallmentPlans from "./pages/billings/InstallmentPlans";
import AddInstallmentPlan from "./pages/billings/AddInstallmentPlan";
import EditInstallmentPlan from "./pages/billings/EditInstallmentPlan";
import BillingInvoiceSetting from "./pages/billings/BillingInvoiceSetting";
import AttendenceList from "./pages/Hr-management/AttendenceList";
import EditAttendenceList from "./pages/Hr-management/EditAttendenceList";
import Chat from "./pages/chat/Chat";
import AddVendor from "./pages/vendor/AddVendor";
import EditVendor from "./pages/vendor/EditVendor";
import NewLead from "./pages/leads/NewLead";
import AddLeads from "./pages/leads/AddLeads";
import UpdateLead from "./pages/leads/UpdateLead";
import LeadsInProgress from "./pages/leads/LeadsInProgress";
import LeadCompleted from "./pages/leads/LeadCompleted";
import LeadHistory from "./pages/leads/LeadHistory";
import EditServiceCompleted from "./pages/service-requist/EditServiceCompleted";
import MailServiceCompleted from "./pages/service-requist/MailServiceCompleted";
import ViewQoutation from "./pages/service-requist/ViewQoutation";
import AboutCompany from "./pages/settings/AboutCompany";

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
            path="service-request-completed/edit/:id"
            element={<EditServiceCompleted />}
          />
          <Route
            path="service-request-completed/mail/:id"
            element={<MailServiceCompleted />}
          />
          <Route
            path="service-request-completed/view-report/:id"
            element={<ServiceCompletedView />}
          />
          <Route path="service-quotation" element={<ServiceQoutation />} />
          <Route
            path="service-quotation/view/:id"
            element={<ViewQoutation />}
          />
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
          {/* ==================== Hr ManageMent ============================ */}
          <Route path="attendance" element={<Attendance />} />
          <Route path="attendance-list" element={<AttendenceList />} />
          <Route
            path="attendance-list/edit/:id"
            element={<EditAttendenceList />}
          />

          {/* ==================== end ===================== */}
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
          {/*================== Sales route ========================*/}
          <Route path="sales-qoutation" element={<SalesQoutation />} />
          <Route
            path="/sales/add-quotation/:type"
            element={<AddQuotationPage />}
          />
          <Route path="sales-qoutation/edit/:id" element={<EditSaleParts />} />
          <Route path="sales-qoutation/view/:id" element={<ViewSales />} />
          <Route path="sales-invoice" element={<SalesPartsInvoice />} />
          <Route path="sales-invoice/pay/:id" element={<SalesInvoicePay />} />
          <Route path="sales-invoice/edit/:id" element={<EditInvoicePay />} />
          <Route path="sales-invoice/view/:id" element={<SalesInvoiceView />} />
          <Route path="sales-in-progress" element={<SalesInProgress />} />
          <Route path="completed-sales" element={<SalesCompleted />} />
          <Route path="sales-history" element={<SalesHistory />} />
          {/*============= end sales route  =======================*/}
          {/*================== Rentals route ========================*/}
          <Route path="rental-qoutation" element={<RentalQoutation />} />
          <Route path="rental-qoutation/add" element={<AddRentalQuotation />} />
          <Route
            path="rental-qoutation/view/:id"
            element={<RentalQoutationView />}
          />
          <Route
            path="rental-qoutation/edit/:id"
            element={<RentalPartEdit />}
          />
          <Route path="rental-qoutation/buy/:id" element={<RentalPartBuy />} />
          <Route path="rental-invoices" element={<RentalPartInvoices />} />
          <Route path="rental-in-progress" element={<RentalInProgress />} />
          <Route path="rental-completed" element={<RentalCompleted />} />
          <Route path="rental-history" element={<RentalHistory />} />
          {/*================== End rental ========================*/}
          {/*================== Reports ========================*/}
          <Route path="service-report" element={<ServiceReport />} />
          <Route
            path="service-report/print/:id"
            element={<ServiceReportPrint />}
          />
          <Route path="report-inspection" element={<ReportInspection />} />
          <Route
            path="report-inspection/view/:id"
            element={<ViewReportInspection />}
          />
          <Route
            path="report-inspection/print/:id"
            element={<InspectionPrintReport />}
          />
          <Route
            path="report-inspection/report-activity/:id"
            element={<InspectionReportActivity />}
          />
          <Route
            path="facility-reports"
            element={<FacilityInventoryReport />}
          />
          <Route
            path="inspection-range-reports"
            element={<InspectionRangeReport />}
          />
          <Route
            path="equipment-service-history"
            element={<EquipmentServiceHistory />}
          />
          {/*================== End reports ========================*/}
          {/* ======================= Billings Route ================================= */}
          <Route path="billing-invoice" element={<BillingsInvoice />} />
          <Route path="installment-invoices" element={<BillingInstallment />} />
          <Route path="billing-reports" element={<BillingReport />} />
          <Route path="revenue-reports" element={<BillingRevenueReports />} />
          <Route path="cc-forms" element={<CCAuthForms />} />
          <Route path="installment-plans" element={<InstallmentPlans />} />
          <Route
            path="installment-plans/add"
            element={<AddInstallmentPlan />}
          />
          <Route
            path="installment-plans/edit/:id"
            element={<EditInstallmentPlan />}
          />
          <Route path="billing-settings" element={<BillingInvoiceSetting />} />

          {/* ======================= Ends Billings Route ================================= */}
          <Route path="leads" element={<Leads />} />
          {/* ================= Vendor ===================== */}
          <Route path="vendor" element={<Vendor />} />
          <Route path="vendor/add" element={<AddVendor />} />
          <Route path="vendor/edit-vendor/:id" element={<EditVendor />} />

          {/* ================= end Vendor ===================== */}

          {/* ======================= Leads Route ================================= */}
          <Route path="new-lead" element={<NewLead />} />
          <Route path="new-lead/add-leads" element={<AddLeads />} />
          <Route path="new-lead/edit/:id" element={<UpdateLead />} />
          <Route path="lead-in-progress" element={<LeadsInProgress />} />
          <Route path="lead-completed" element={<LeadCompleted />} />
          <Route path="leads-history" element={<LeadHistory />} />

          {/* ======================= Ends Leads Route ================================= */}

          <Route path="documentation" element={<Documentation />} />
          <Route path="about-company" element={<AboutCompany />} />
        </Route>
        <Route
          path="/new-request/auth/:id"
          element={<CreditCardAuthorization />}
        />
        <Route path="/sales/convert-invoice/:id" element={<SalesInvoice />} />
        <Route path="/sales/credit-auth/:id" element={<SalesCreditCard />} />
        <Route
          path="rental-qoutation/rental-invoice/:id"
          element={<RentalConvertInvoice />}
        />
        <Route
          path="rental-qoutation/credit-card/:id"
          element={<RentalCreditCard />}
        />
      </Routes>
    </BrowserRouter>
  );
}
