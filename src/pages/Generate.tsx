import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import Papa from 'papaparse';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { 
  Upload, 
  FileSpreadsheet, 
  ArrowRight, 
  AlertCircle,
  CheckCircle,
  Send,
  Download,
  Eye
} from 'lucide-react';

// Lazy load the preview component (uses react-konva)
const CertificatePreview = lazy(() => import('@/components/generate/CertificatePreview'));

interface CsvRow {
  [key: string]: string;
}

export default function Generate() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [selectedTemplateId, setSelectedTemplateId] = useState(searchParams.get('template') || '');
  const [csvData, setCsvData] = useState<CsvRow[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [sendEmails, setSendEmails] = useState(true);
  const [emailColumn, setEmailColumn] = useState('email');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  // Fetch templates
  const { data: templates } = useQuery({
    queryKey: ['templates', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('certificate_templates')
        .select('*, template_fields(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const selectedTemplate = templates?.find(t => t.id === selectedTemplateId);
  const templateFields = (selectedTemplate?.template_fields as any[]) || [];

  // Handle CSV upload
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as CsvRow[];
        const headers = results.meta.fields || [];
        
        setCsvData(data);
        setCsvHeaders(headers);

        // Auto-map fields
        const mapping: Record<string, string> = {};
        templateFields.forEach((field) => {
          const matchingHeader = headers.find(
            h => h.toLowerCase() === field.field_key.toLowerCase()
          );
          if (matchingHeader) {
            mapping[field.field_key] = matchingHeader;
          }
        });
        setFieldMapping(mapping);

        // Auto-detect email column
        const emailHeader = headers.find(h => h.toLowerCase().includes('email'));
        if (emailHeader) {
          setEmailColumn(emailHeader);
        }

        setStep(3);
        toast({ title: 'CSV loaded', description: `Found ${data.length} records` });
      },
      error: (error) => {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      },
    });
  };

  // Generate certificates (placeholder - actual generation would be in edge function)
  const handleGenerate = async () => {
    if (!selectedTemplate || csvData.length === 0) return;

    setIsGenerating(true);
    setGenerationProgress(0);

    try {
      // Create batch job
      const { data: batch, error: batchError } = await supabase
        .from('batch_jobs')
        .insert({
          user_id: user!.id,
          template_id: selectedTemplateId,
          name: `${selectedTemplate.name} - ${new Date().toLocaleDateString()}`,
          status: 'processing',
          total_count: csvData.length,
          csv_data: csvData,
        })
        .select()
        .single();

      if (batchError) throw batchError;

      // Simulate progress (in production, this would be handled by an edge function)
      for (let i = 0; i < csvData.length; i++) {
        const row = csvData[i];
        
        // Create certificate record
        await supabase.from('certificates').insert({
          batch_id: batch.id,
          template_id: selectedTemplateId,
          recipient_name: row[fieldMapping.name || 'name'] || 'Unknown',
          recipient_email: sendEmails ? row[emailColumn] : null,
          recipient_data: row,
          email_status: sendEmails ? 'pending' : 'pending',
        });

        setGenerationProgress(Math.round(((i + 1) / csvData.length) * 100));
      }

      // Update batch status
      await supabase
        .from('batch_jobs')
        .update({
          status: 'completed',
          generated_count: csvData.length,
        })
        .eq('id', batch.id);

      toast({
        title: 'Generation Complete',
        description: `Created ${csvData.length} certificates`,
      });

      setStep(4);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Generate Certificates</h1>
          <p className="text-muted-foreground mt-1">
            Create personalized certificates from your template and CSV data
          </p>
        </div>

        {/* Progress steps */}
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step >= s
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {step > s ? <CheckCircle className="w-4 h-4" /> : s}
              </div>
              {s < 4 && (
                <div
                  className={`w-12 h-1 mx-2 rounded ${
                    step > s ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Select Template */}
        {step === 1 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Select Template</CardTitle>
                <CardDescription>Choose the certificate template to use</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates?.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedTemplate && (
                  <div className="flex gap-4 p-4 rounded-lg bg-muted">
                    <img
                      src={selectedTemplate.image_url}
                      alt={selectedTemplate.name}
                      className="w-32 h-24 object-cover rounded"
                    />
                    <div>
                      <h4 className="font-medium">{selectedTemplate.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {selectedTemplate.description || 'No description'}
                      </p>
                      <div className="flex gap-1 mt-2">
                        {templateFields.map((f: any) => (
                          <Badge key={f.id} variant="secondary" className="text-xs">
                            {`{{${f.field_key}}}`}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <Button
                  onClick={() => setStep(2)}
                  disabled={!selectedTemplateId}
                  className="w-full"
                >
                  Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Step 2: Upload CSV */}
        {step === 2 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Upload CSV Data</CardTitle>
                <CardDescription>
                  Upload a CSV file with recipient data. Required columns: {templateFields.map((f: any) => f.field_key).join(', ')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="font-semibold mb-2">Upload CSV File</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Click to browse or drag and drop
                  </p>
                  <Button variant="secondary">Choose File</Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleCsvUpload}
                    className="hidden"
                  />
                </div>

                <div className="p-4 rounded-lg bg-muted/50">
                  <h4 className="font-medium flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-warning" />
                    CSV Format
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Your CSV should have headers matching the field keys in your template:
                  </p>
                  <code className="text-xs block mt-2 p-2 bg-background rounded">
                    {templateFields.map((f: any) => f.field_key).join(',')},email
                  </code>
                </div>

                <Button variant="outline" onClick={() => setStep(1)} className="w-full">
                  Back
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Step 3: Map & Confirm */}
        {step === 3 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <Card>
              <CardHeader>
                <CardTitle>Map Fields</CardTitle>
                <CardDescription>
                  Match your CSV columns to template fields
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {templateFields.map((field: any) => (
                  <div key={field.id} className="flex items-center gap-4">
                    <Label className="w-32 text-right">{`{{${field.field_key}}}`}</Label>
                    <Select
                      value={fieldMapping[field.field_key] || ''}
                      onValueChange={(v) =>
                        setFieldMapping({ ...fieldMapping, [field.field_key]: v })
                      }
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {csvHeaders.map((h) => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Email Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="send-emails"
                    checked={sendEmails}
                    onCheckedChange={(c) => setSendEmails(c === true)}
                  />
                  <Label htmlFor="send-emails">Send certificates via email</Label>
                </div>

                {sendEmails && (
                  <div className="flex items-center gap-4">
                    <Label className="w-32 text-right">Email column</Label>
                    <Select value={emailColumn} onValueChange={setEmailColumn}>
                      <SelectTrigger className="flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {csvHeaders.map((h) => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Preview Data ({csvData.length} records)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-auto max-h-64">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {csvHeaders.slice(0, 5).map((h) => (
                          <TableHead key={h}>{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {csvData.slice(0, 5).map((row, i) => (
                        <TableRow key={i}>
                          {csvHeaders.slice(0, 5).map((h) => (
                            <TableCell key={h}>{row[h]}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {csvData.length > 5 && (
                  <p className="text-sm text-muted-foreground mt-2">
                    And {csvData.length - 5} more records...
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                Back
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowPreview(true)}
                disabled={!selectedTemplate || csvData.length === 0}
              >
                <Eye className="w-4 h-4 mr-2" />
                Preview
              </Button>
              <Button onClick={handleGenerate} disabled={isGenerating} className="flex-1">
                {isGenerating ? (
                  <>Generating...</>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Generate {csvData.length} Certificates
                  </>
                )}
              </Button>
            </div>

            {/* Certificate Preview Modal */}
            <Suspense fallback={null}>
              <CertificatePreview
                open={showPreview}
                onOpenChange={setShowPreview}
                template={selectedTemplate || null}
                templateFields={templateFields}
                csvData={csvData}
                fieldMapping={fieldMapping}
              />
            </Suspense>

            {isGenerating && (
              <Card>
                <CardContent className="py-6">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Generating certificates...</span>
                      <span>{generationProgress}%</span>
                    </div>
                    <Progress value={generationProgress} />
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        )}

        {/* Step 4: Complete */}
        {step === 4 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card>
              <CardContent className="py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-success" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Generation Complete!</h2>
                <p className="text-muted-foreground mb-6">
                  Successfully created {csvData.length} certificates
                  {sendEmails && ' and queued them for email delivery'}
                </p>
                <div className="flex gap-2 justify-center">
                  <Button variant="outline" onClick={() => navigate('/history')}>
                    <Eye className="w-4 h-4 mr-2" />
                    View History
                  </Button>
                  <Button onClick={() => {
                    setStep(1);
                    setCsvData([]);
                    setCsvHeaders([]);
                    setFieldMapping({});
                    setSelectedTemplateId('');
                  }}>
                    Generate More
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </DashboardLayout>
  );
}
