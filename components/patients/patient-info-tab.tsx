'use client';

interface PatientInfoTabProps {
  patient: any;
}

export default function PatientInfoTab({ patient }: PatientInfoTabProps) {
  if (!patient) {
    return <div className="text-gray-400">Loading patient information...</div>;
  }

  const calculateAge = (dob: string) => {
    if (!dob) return 'N/A';
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const infoSections: Array<{
    title: string;
    fields: Array<{
      label: string;
      value: any;
      multiline?: boolean;
      badge?: boolean;
    }>;
  }> = [
    {
      title: 'Personal Information',
      fields: [
        { label: 'Full Name', value: patient.name },
        { label: 'Patient ID', value: patient.patient_id },
        { label: 'Gender', value: patient.gender || 'N/A' },
        { label: 'Date of Birth', value: patient.date_of_birth || 'N/A' },
        { label: 'Age', value: calculateAge(patient.date_of_birth) },
        { label: 'Date of Join', value: patient.date_of_join },
      ],
    },
    {
      title: 'Contact Information',
      fields: [
        { label: 'Phone', value: patient.phone || 'N/A' },
        { label: 'Address', value: patient.address || 'N/A' },
        { label: 'Emergency Contact Name', value: patient.emergency_contact_name || 'N/A' },
        { label: 'Emergency Contact Phone', value: patient.emergency_contact_phone || 'N/A' },
      ],
    },
    {
      title: 'Medical Information',
      fields: [
        { label: 'Medical History', value: patient.medical_history || 'N/A', multiline: true },
        { label: 'Allergies', value: patient.allergies || 'N/A', multiline: true },
        { label: 'Current Medications', value: patient.current_medications || 'N/A', multiline: true },
      ],
    },
    {
      title: 'Status',
      fields: [
        { label: 'Status', value: patient.status, badge: true },
      ],
    },
  ];

  return (
    <div className="space-y-6 max-h-[60vh] overflow-y-auto">
      {infoSections.map((section, idx) => (
        <div key={idx} className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-xl font-semibold text-white mb-4">{section.title}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {section.fields.map((field: any, fieldIdx) => (
              <div
                key={fieldIdx}
                className={field.multiline ? 'md:col-span-2' : ''}
              >
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  {field.label}
                </label>
                {field.badge ? (
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                      field.value === 'Active'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}
                  >
                    {field.value}
                  </span>
                ) : field.multiline ? (
                  <p className="text-white whitespace-pre-wrap">{field.value}</p>
                ) : (
                  <p className="text-white">{field.value}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
