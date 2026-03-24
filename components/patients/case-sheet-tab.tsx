'use client';

import { useState, useEffect } from 'react';
import { Plus, Upload, Download, FileText, Trash2 } from 'lucide-react';
import { useUser } from '@/hooks/use-user';

interface CaseSheetTabProps {
  patientId: string;
  billing: any;
}

export default function CaseSheetTab({ patientId, billing }: CaseSheetTabProps) {
  const { user } = useUser();
  const [caseSheet, setCaseSheet] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
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
        setCaseSheet(data[0] || null);
        if (data[0]) {
          setFormData({
            discharge_date: data[0].discharge_date || '',
            discharge_notes: data[0].discharge_notes || '',
            case_sheet_file: null,
          });
        }
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

  const handleViewPDF = async () => {
    if (!caseSheet?.id) return;

    try {
      const response = await fetch(
        `/api/patients/${patientId}/case-sheets/${caseSheet.id}/download`
      );

      if (!response.ok) {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to get download URL');
        return;
      }

      const { downloadUrl } = await response.json();
      window.open(downloadUrl, '_blank');
    } catch (error) {
      console.error('Error viewing PDF:', error);
      alert('Failed to view PDF');
    }
  };

  const handleDownloadPDF = async () => {
    if (!caseSheet?.id) return;

    try {
      const response = await fetch(
        `/api/patients/${patientId}/case-sheets/${caseSheet.id}/download`
      );

      if (!response.ok) {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to get download URL');
        return;
      }

      const { downloadUrl, filename } = await response.json();
      
      // Create a temporary link and click it to download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename || 'case-sheet.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      alert('Failed to download PDF');
    }
  };

  const uploadToR2 = async (file: File): Promise<{ url: string; filename: string } | null> => {
    setUploading(true);
    try {
      // Upload to backend API endpoint (avoids CORS issues)
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`/api/patients/${patientId}/case-sheets/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload file');
      }

      const { url, filename } = await response.json();
      return { url, filename };
    } catch (error) {
      console.error('Error uploading file:', error);
      let errorMessage = 'Failed to upload file. Please try again.';
      
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        errorMessage = 'Network error: Unable to reach the upload service. Please check your connection and try again.';
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      alert(`Failed to upload file: ${errorMessage}`);
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isEditing && caseSheet) {
        // Update existing case sheet
        if (formData.case_sheet_file) {
          // Use FormData for file upload through PATCH
          const patchFormData = new FormData();
          patchFormData.append('file', formData.case_sheet_file);
          patchFormData.append('discharge_date', formData.discharge_date);
          patchFormData.append('discharge_notes', formData.discharge_notes);

          const response = await fetch(`/api/patients/${patientId}/case-sheets/${caseSheet.id}`, {
            method: 'PATCH',
            body: patchFormData,
          });

          if (response.ok) {
            await fetchCaseSheets();
            setShowForm(false);
            setIsEditing(false);
            setFormData({
              discharge_date: '',
              discharge_notes: '',
              case_sheet_file: null,
            });
          } else {
            const errorData = await response.json();
            alert(errorData.error || 'Failed to update case sheet');
          }
        } else {
          // No file, just update metadata with JSON
          const response = await fetch(`/api/patients/${patientId}/case-sheets/${caseSheet.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              discharge_date: formData.discharge_date,
              discharge_notes: formData.discharge_notes,
            }),
          });

          if (response.ok) {
            await fetchCaseSheets();
            setShowForm(false);
            setIsEditing(false);
            setFormData({
              discharge_date: '',
              discharge_notes: '',
              case_sheet_file: null,
            });
          } else {
            const errorData = await response.json();
            alert(errorData.error || 'Failed to update case sheet');
          }
        }
      } else if (!caseSheet) {
        // Create new case sheet
        if (formData.case_sheet_file) {
          // Use FormData for file upload through POST
          const postFormData = new FormData();
          postFormData.append('file', formData.case_sheet_file);
          postFormData.append('discharge_date', formData.discharge_date);
          postFormData.append('discharge_notes', formData.discharge_notes);
          postFormData.append('patient_billing_id', billing?.id || '');

          const response = await fetch(`/api/patients/${patientId}/case-sheets`, {
            method: 'POST',
            body: postFormData,
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
            const errorData = await response.json();
            alert(errorData.error || 'Failed to save case sheet');
          }
        } else {
          // No file, use JSON
          const response = await fetch(`/api/patients/${patientId}/case-sheets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              patient_billing_id: billing?.id,
              discharge_date: formData.discharge_date,
              discharge_notes: formData.discharge_notes,
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
            const errorData = await response.json();
            alert(errorData.error || 'Failed to save case sheet');
          }
        }
      }
    } catch (error) {
      console.error('Error saving case sheet:', error);
      alert('Failed to save case sheet');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!caseSheet || !user || user.role !== 'ADMIN') return;
    
    if (!confirm('Are you sure you want to delete this case sheet?')) return;

    try {
      const response = await fetch(`/api/patients/${patientId}/case-sheets/${caseSheet.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setCaseSheet(null);
        setFormData({
          discharge_date: '',
          discharge_notes: '',
          case_sheet_file: null,
        });
      } else {
        alert('Failed to delete case sheet');
      }
    } catch (error) {
      console.error('Error deleting case sheet:', error);
      alert('Failed to delete case sheet');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold text-foreground">Case Sheet & Discharge</h3>
        {!caseSheet && (
          <button
            onClick={() => {
              setShowForm(!showForm);
              setIsEditing(false);
            }}
            className="flex items-center gap-2 bg-info hover:bg-info-hover text-foreground px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Case Sheet
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface-hover rounded-lg p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted mb-2">
                Discharge Date
              </label>
              <input
                type="date"
                value={formData.discharge_date}
                onChange={(e) => setFormData({ ...formData, discharge_date: e.target.value })}
                className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-2">
                Upload Case Sheet (PDF)
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:bg-info file:text-foreground file:cursor-pointer hover:file:bg-info-hover"
                />
              </div>
              {formData.case_sheet_file && (
                <p className="text-sm text-muted mt-1">
                  Selected: {formData.case_sheet_file.name}
                </p>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-muted mb-2">
                Discharge Notes
              </label>
              <textarea
                rows={5}
                value={formData.discharge_notes}
                onChange={(e) => setFormData({ ...formData, discharge_notes: e.target.value })}
                className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
                placeholder="Enter discharge summary, follow-up instructions, etc..."
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading || uploading}
              className="bg-success hover:bg-success-hover text-foreground px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
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
              className="bg-surface-inset hover:bg-surface-inset text-foreground px-6 py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {!caseSheet ? (
          <div className="bg-surface-hover rounded-lg p-8 text-center text-muted">
            No case sheet recorded yet
          </div>
        ) : (
          <div className="bg-surface-hover rounded-lg p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="h-5 w-5 text-info" />
                  <h4 className="text-lg font-semibold text-foreground">
                    Case Sheet - {caseSheet.discharge_date ? new Date(caseSheet.discharge_date).toLocaleDateString() : 'No Date'}
                  </h4>
                </div>
                
                {caseSheet.discharge_notes && (
                  <div className="mb-4">
                    <p className="text-sm font-medium text-muted mb-1">Discharge Notes:</p>
                    <p className="text-foreground whitespace-pre-wrap">{caseSheet.discharge_notes}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                  <div>
                    <span className="text-muted">Created:</span>
                    <span className="text-foreground ml-2">
                      {new Date(caseSheet.created_at).toLocaleString()}
                    </span>
                  </div>
                  {caseSheet.uploaded_at && (
                    <div>
                      <span className="text-muted">Uploaded:</span>
                      <span className="text-foreground ml-2">
                        {new Date(caseSheet.uploaded_at).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {caseSheet.case_sheet_url && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleViewPDF()}
                    className="flex items-center gap-2 bg-info hover:bg-info-hover text-foreground px-4 py-2 rounded-lg transition-colors ml-4"
                  >
                    <FileText className="h-4 w-4" />
                    View PDF
                  </button>
                  <button
                    onClick={() => handleDownloadPDF()}
                    className="flex items-center gap-2 bg-success hover:bg-success-hover text-foreground px-4 py-2 rounded-lg transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    Download PDF
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-4 border-t border-input-border">
              <button
                onClick={() => {
                  setShowForm(!showForm);
                  setIsEditing(true);
                }}
                className="flex items-center gap-2 bg-info hover:bg-info-hover text-foreground px-4 py-2 rounded-lg transition-colors"
              >
                <Plus className="h-4 w-4" />
                Edit Case Sheet
              </button>
              {user?.role === 'ADMIN' && (
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-2 bg-destructive hover:bg-destructive-hover text-foreground px-4 py-2 rounded-lg transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
