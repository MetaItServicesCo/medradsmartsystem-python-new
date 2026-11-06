/**
 * The proposed list of modalities and sub-modalities, shown for review in the
 * New Modalities tab. It is not in use yet: assets, inspections and inventory
 * still use the modalities stored in the database.
 */
export interface NewModality {
  name: string
  subModalities: string[]
}

export const NEW_MODALITIES: NewModality[] = [
  {
    name: 'Bed Stretchers',
    subModalities: ['Hospital Beds', 'Birthing Beds', 'Stretcher', 'Patient Recliner', 'Patient Beds'],
  },
  {
    name: 'Exam',
    subModalities: [
      'Exam Chair', 'Power Exam Table', 'Exam Light', 'Oto-ophthalmoscopes', 'Exam Table', 'Thermometer',
      'Thermo-scan Thermometer', 'Infrared Thermometer', 'Patient Scale', 'Exam Bed', 'Temp Probe',
      'Applanation Thermometer', 'Otoscope', 'UV Lights', 'Audiometer', 'Mechanical Scale', 'Digital Scale',
    ],
  },
  {
    name: 'Obstetrics',
    subModalities: ['Infant Cribs', 'Infant Incubators', 'Infant Warmer', 'Infant Scale'],
  },
  {
    name: 'Infusion',
    subModalities: ['Infusion Pump', 'PCA Pump', 'Feeding Pump', 'Syringe Pump', 'Compression Pump', 'Pump'],
  },
  {
    name: 'Patient Support',
    subModalities: [
      'Patient Lifts', 'Patient Warming System', 'Ice Machine', 'Mini Fridge', 'Blanket Warmer', 'Patient Scale',
      'Refrigerator', 'Aspirator (Suction Pump) (Wall Suction Regulator)', 'Towel Warmer', 'Dehumidifier',
      'Disinfector', 'Vaccine Fridge', 'Drug Refrigerator', 'Freezer', 'Power Supply', 'Glucometer',
      'Hydro collator', 'Ambient Temperature Sensor',
    ],
  },
  {
    name: 'Ventilators',
    subModalities: ['Ventilator', 'Oxygen Concentrator', 'ByPap', 'Flow Meter'],
  },
  {
    name: 'Lab',
    subModalities: [
      'Hematology Analyzers', 'Analyzers', 'Coagulation Analyzer', 'Lab Analyzer', 'Array System',
      'Thrombelastography Analyzer', 'Centrifuges', 'Microscope', 'Differential Analyzer', 'Urine Analyzer',
      'Breathalyzer', 'Vacuum hood/vent',
    ],
  },
  {
    name: 'Dialysis',
    subModalities: ['Transfusion System', 'Auto transfusion System'],
  },
  {
    name: 'Surgery',
    subModalities: [
      'Phaco Systems', 'RF Generators', 'Tourniquet System', 'ESU System (Also for RF System)', 'Cryosurgical System',
      'Footswitch', 'Surgery General-NO2 delivery system',
    ],
  },
  {
    name: 'Endoscopy',
    subModalities: [
      'Video Laryngoscopes', 'Light Sources', 'Endoscopy System', 'Video Processor', 'Clono scope', 'Bronchoscope',
      'Power Consoles', 'Camera Control-Unit', 'Endo-cam', 'Endoscope Monitor', 'Endoscope Flushing-Pump',
      'Endoscope Leakage-Tester', 'Endoscope Washer', 'Endo-light', 'video system center',
    ],
  },
  {
    name: 'Cardiology',
    subModalities: ['Stress Test', 'Ecg-ekg Machine'],
  },
  {
    name: 'Or',
    subModalities: [
      'Or Tables', 'Spinal Surgery Table', 'Positioner System', 'Mount OR Light', 'Surgery Table', 'Or Light',
      'Or Monitor_2', 'Or Monitor_1', 'Or Bed',
    ],
  },
  {
    name: 'Defibrillators',
    subModalities: ['Defibrillator', 'AED'],
  },
  {
    name: 'Sterilization',
    subModalities: ['Free Standing Sterilizer', 'Ultrasonic Cleaner', 'Low temp Sterilizer', 'Autoclave', 'Sterilizer'],
  },
  {
    name: 'Therapy Equipment',
    subModalities: ['Pt Table', 'Cross training Machine', 'Elliptical', 'Treadmill', 'Exercise Machine'],
  },
  {
    name: 'Patient Monitors',
    subModalities: ['Vital-Sign Monitors also BP Monitor', 'Co2 Gas module', 'MAGM', 'Pulse Oximeter', 'NIBP'],
  },
  {
    name: 'Anesthesia',
    subModalities: ['Anesthesia Machines', 'Sevoflurane Vaporizer', 'Isoflurane Vaporizer', 'Desflurane Vaporizer', 'Vaporizer'],
  },
  {
    name: 'Radiology and Imaging',
    subModalities: [
      'Ct Scanner', 'C Arm', 'MRI', 'Dexa', 'C Arm table', 'Mobile X_ray_machine', 'Cr Systems', 'Dr Systems',
      'Portable X-ray', 'X Ray', 'Bladder Scanner',
    ],
  },
  {
    name: 'Lasers',
    subModalities: ['Laser System', 'D Laser system', 'SI Laser System'],
  },
  {
    name: 'Ultrasounds',
    subModalities: ['Machines', 'Bladder Scanners', 'Transducer'],
  },
  {
    name: 'Ophthalmic',
    subModalities: [
      'Eye lite Laser-photocoagulator', 'Retinal Camera', 'Polarimeter Ophthalmology', 'Fundus Camera', 'Tomographic',
      'Field Analyzer', 'Laser System',
    ],
  },
  {
    name: 'Surgical Microscopes',
    subModalities: [
      'Surgical Microscope', 'Carl Zeiss_surgical_microscope', 'Carl Zeiss_opmi_1_f-surgical_microscope',
      'Moller Wedel-fs_3010_neurosurgical_microscope', 'Karl Storz_us_1_surgical_microscope',
    ],
  },
  {
    name: 'Powered Instruments',
    subModalities: ['Plastic Vac', 'Powered Instrument set', 'Drill reamer', 'Saws', 'Drill Set', 'Handpiece'],
  },
  {
    name: 'Surgical Sets',
    subModalities: ['Instrument Set', 'Suction Regulator (Vacuum Regulator)'],
  },
  {
    name: 'Electronics',
    subModalities: ['Ups', 'Video Monitor', 'Power Bank'],
  },
  {
    name: 'Printers',
    subModalities: ['Ultrasound Printer', 'Color Printer', 'Printers', 'Label Printers'],
  },
  {
    name: 'Cosmetics',
    subModalities: ['Shock wave/ pressure wave'],
  },
]
