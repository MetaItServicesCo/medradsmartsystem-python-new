# Medrad Admin Panel - Healthcare Equipment Management System

Version 2.0 | Python FastAPI + React

## Overview

Comprehensive web-based healthcare equipment management system for hospitals, clinics, and medical facilities. Manages equipment lifecycle including maintenance, inventory, service requests, inspections, attendance tracking, billing, and reporting.

## Tech Stack

### Backend
- **Framework**: FastAPI (Python 3.11+)
- **Database**: PostgreSQL 15
- **ORM**: SQLAlchemy 2.0
- **Authentication**: JWT (python-jose)
- **Face Recognition**: face_recognition library
- **Task Queue**: Celery + Redis
- **Reporting**: ReportLab, OpenPyXL

### Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **UI Library**: Material-UI (MUI)
- **State Management**: Zustand
- **Data Fetching**: TanStack Query (React Query)
- **Forms**: React Hook Form + Zod
- **Charts**: Recharts

## Project Structure

```
medrad-admin-panel/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   └── v1/
│   │   │       ├── endpoints/
│   │   │       │   ├── auth.py
│   │   │       │   ├── service_requests.py
│   │   │       │   ├── inspections.py
│   │   │       │   ├── sales.py
│   │   │       │   ├── rentals.py
│   │   │       │   └── ...
│   │   │       └── api.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   └── security.py
│   │   ├── db/
│   │   │   └── base.py
│   │   ├── models/
│   │   │   ├── user.py
│   │   │   ├── facility.py
│   │   │   ├── equipment.py
│   │   │   ├── service_request.py
│   │   │   ├── inspection.py
│   │   │   ├── invoice.py
│   │   │   └── rental.py
│   │   ├── schemas/
│   │   ├── services/
│   │   └── main.py
│   ├── alembic/
│   ├── tests/
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── client.ts
│   │   │   ├── serviceRequests.ts
│   │   │   └── ...
│   │   ├── components/
│   │   │   ├── Layout/
│   │   │   ├── ServiceRequests/
│   │   │   ├── Inspections/
│   │   │   └── ...
│   │   ├── pages/
│   │   │   ├── Dashboard/
│   │   │   ├── ServiceRequests/
│   │   │   ├── Inspections/
│   │   │   ├── Sales/
│   │   │   └── Rentals/
│   │   ├── stores/
│   │   │   └── authStore.ts
│   │   ├── types/
│   │   ├── utils/
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/
│   ├── Dockerfile
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml
├── .env.example
└── README.md
```

## Priority Modules (Phase 1)

1. **Service Request Management**
   - Create, assign, track service requests
   - Technician workflow (New → Assigned → In Progress → Completed)
   - Parts usage tracking
   - Time tracking and billing

2. **Inspection Management**
   - Scheduled and instant inspections
   - Customizable inspection forms
   - Pass/fail criteria validation
   - Compliance reporting

3. **Sales Management**
   - Quotation creation
   - Invoice generation
   - Payment tracking
   - Inventory integration

4. **Rental Management**
   - Rental agreements
   - Periodic billing
   - Equipment handover/return
   - Maintenance tracking

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- Docker & Docker Compose (optional)

### Installation

#### Option 1: Docker (Recommended)

1. Clone the repository
```bash
git clone <repository-url>
cd medrad-admin-panel
```

2. Copy environment file
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Start services
```bash
docker-compose up -d
```

4. Run database migrations
```bash
docker-compose exec backend alembic upgrade head
```

5. Access the application
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

#### Option 2: Manual Setup

**Backend Setup**

1. Create virtual environment
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies
```bash
pip install -r requirements.txt
```

3. Setup database
```bash
# Create PostgreSQL database
createdb medrad_db

# Run migrations
alembic upgrade head
```

4. Start backend server
```bash
uvicorn app.main:app --reload --port 8000
```

**Frontend Setup**

1. Install dependencies
```bash
cd frontend
npm install
```

2. Start development server
```bash
npm run dev
```

## Database Migrations

Create new migration:
```bash
cd backend
alembic revision --autogenerate -m "description"
```

Apply migrations:
```bash
alembic upgrade head
```

Rollback migration:
```bash
alembic downgrade -1
```

## API Documentation

Interactive API documentation available at:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Testing

**Backend Tests**
```bash
cd backend
pytest
```

**Frontend Tests**
```bash
cd frontend
npm run test
```

## User Roles

- **SuperAdmin**: Full system access
- **Admin**: Multi-facility management
- **Facility Admin**: Single facility operations
- **Technician**: Service and inspection execution
- **HR Manager**: User and attendance management
- **Facility Manager**: Operational oversight
- **Employee**: Attendance marking only
- **Client**: External customer portal access

## Key Features

### Service Request Workflow
1. Request creation (Facility Manager/Client)
2. Technician assignment (Admin)
3. Work execution with parts tracking
4. Completion and billing

### Inspection Workflow
1. Automated scheduling based on equipment modality
2. Customizable inspection forms
3. Pass/fail validation
4. Compliance certification

### Sales Workflow
1. Quotation creation
2. Approval and conversion to invoice
3. Payment tracking
4. Inventory deduction

### Rental Workflow
1. Agreement creation
2. Equipment handover
3. Periodic billing
4. Return and settlement

## Security Features

- JWT-based authentication
- Role-based access control (RBAC)
- Password hashing (bcrypt)
- Account lockout after failed attempts
- Session timeout
- AES-256 encryption for sensitive data
- SQL injection prevention
- XSS protection

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

## License

Proprietary - Medrad Healthcare Solutions

## Support

For technical support, contact: support@medrad.com

## Version History

- **v2.0.0** (December 2024) - Complete system with priority modules
- **v1.5.0** (June 2024) - Enhanced features and reporting
