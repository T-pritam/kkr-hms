'use client';

import { useState, useEffect } from 'react';
import { Plus, Upload, Download, FileText } from 'lucide-react';

interface CaseSheetTabProps {
  patientId: string;
  billing: any;
}

export default function CaseSheetTab({ patientId, billing }: CaseSheetTabProps) {
  const [caseSheets, setCaseSheets] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    discharge_date: '',
    discharge_notes: '',
    case_sheet_file: null as File | null,
  });

  useEffect(() => {
    fetchCaseSheets();
  }, [patientId]);

  const fetchCaseSheets = async () => {
    try {
      const response = await fetch(`/api/patients/${patientId}/case-sheets`);
      if (response.ok) {
        const data = await response.json();
        setCaseSheets(data);
      }
    } catch (error) {
      console.error('Error fetching case sheets:', error);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        alert('Please select a PDF file');
        return;
      }
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        alert('File size must be less than 10MB');
        return;
      }
      setFormData({ ...formData, case_sheet_file: file });
    }
  };

  const uploadToR2 = async (file: File): Promise<{ url: string; filename: string } | null> => {
    setUploading(true);
    try {
      // Get presigned URL from edge function
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/upload-case-sheet`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            patientId,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { uploadUrl, publicUrl, filename } = await response.json();

      // Upload file to R2
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }

      return { url: publicUrl, filename };
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Failed to upload file. Please try again.');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let caseSheetUrl = '';
      let caseSheetFilename = '';

      // Upload file if selected
      if (formData.case_sheet_file) {
        const uploadResult = await uploadToR2(formData.case_sheet_file);
        if (uploadResult) {
          caseSheetUrl = uploadResult.url;
          caseSheetFilename = uploadResult.filename;
        } else {
          setLoading(false);
          return;
        }
      }

      const response = await fetch(`/api/patients/${patientId}/case-sheets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_billing_id: billing?.id,
          discharge_date: formData.discharge_date,
          discharge_notes: formData.discharge_notes,
          case_sheet_url: caseSheetUrl,
          case_sheet_filename: caseSheetFilename,
        }),
      });

      if (response.ok) {
        await fetchCaseSheets();
        setShowForm(false);
        setFormData({
          discharge_date: '',
          discharge_notes: '',
          case_sheet_file: null,
        });
      } else {
        alert('Failed to save case sheet');
      }
    } catch (error) {
      console.error('Error saving case sheet:', error);
      alert('Failed to save case sheet');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold text-white">Case Sheet & Discharge</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Case Sheet
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Discharge Date
              </label>
              <input
                type="date"
                value={formData.discharge_date}
                onChange={(e) => setFormData({ ...formData, discharge_date: e.target.value })}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Upload Case Sheet (PDF)
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:bg-blue-600 file:text-white file:cursor-pointer hover:file:bg-blue-700"
                />
              </div>
              {formData.case_sheet_file && (
                <p className="text-sm text-gray-400 mt-1">
                  Selected: {formData.case_sheet_file.name}
                </p>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Discharge Notes
              </label>
              <textarea
                rows={5}
                value={formData.discharge_notes}
                onChange={(e) => setFormData({ ...formData, discharge_notes: e.target.value })}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                placeholder="Enter discharge summary, follow-up instructions, etc..."
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading || uploading}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : loading ? 'Saving...' : 'Save Case Sheet'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setFormData({
                  discharge_date: '',
                  discharge_notes: '',
                  case_sheet_file: null,
                });
              }}
              className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {caseSheets.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
            No case sheets recorded yet
          </div>
        ) : (
          caseSheets.map((sheet) => (
            <div key={sheet.id} className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-5 w-5 text-blue-400" />
                    <h4 className="text-lg font-semibold text-white">
                      Case Sheet - {sheet.discharge_date ? new Date(sheet.discharge_date).toLocaleDateString() : 'No Date'}
                    </h4>
                  </div>
                  
                  {sheet.discharge_notes && (
                    <div className="mb-4">
                      <p className="text-sm font-medium text-gray-400 mb-1">Discharge Notes:</p>
                      <p className="text-white whitespace-pre-wrap">{sheet.discharge_notes}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Created:</span>
                      <span className="text-white ml-2">
                        {new Date(sheet.created_at).toLocaleString()}
                      </span>
                    </div>
                    {sheet.uploaded_at && (
                      <div>
                        <span className="text-gray-400">Uploaded:</span>
                        <span className="text-white ml-2">
                          {new Date(sheet.uploaded_at).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {sheet.case_sheet_url && (
                  <a
                    href={sheet.case_sheet_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors ml-4"
                  >
                    <Download className="h-4 w-4" />
                    Download PDF
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
