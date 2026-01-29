import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  Loader2,
  Download,
  Eye,
  FileImage
} from 'lucide-react';
import { format } from 'date-fns';

const statusConfig = {
  pending: { label: 'Pending', icon: Clock, color: 'bg-muted text-muted-foreground' },
  processing: { label: 'Processing', icon: Loader2, color: 'bg-warning/10 text-warning' },
  completed: { label: 'Completed', icon: CheckCircle, color: 'bg-success/10 text-success' },
  failed: { label: 'Failed', icon: XCircle, color: 'bg-destructive/10 text-destructive' },
};

export default function History() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  const { data: batches, isLoading } = useQuery({
    queryKey: ['batch-jobs', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('batch_jobs')
        .select('*, certificate_templates(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  if (authLoading || isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse text-muted-foreground">Loading history...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Generation History</h1>
          <p className="text-muted-foreground mt-1">
            View and manage your certificate batch jobs
          </p>
        </div>

        {batches && batches.length > 0 ? (
          <div className="space-y-4">
            {batches.map((batch, index) => {
              const status = statusConfig[batch.status as keyof typeof statusConfig] || statusConfig.pending;
              const StatusIcon = status.icon;
              const progress = batch.total_count > 0 
                ? Math.round((batch.generated_count / batch.total_count) * 100) 
                : 0;

              return (
                <motion.div
                  key={batch.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg flex items-center gap-2">
                            {batch.name}
                            <Badge className={status.color}>
                              <StatusIcon className={`w-3 h-3 mr-1 ${batch.status === 'processing' ? 'animate-spin' : ''}`} />
                              {status.label}
                            </Badge>
                          </CardTitle>
                          <CardDescription className="flex items-center gap-4 mt-1">
                            <span className="flex items-center gap-1">
                              <FileImage className="w-3 h-3" />
                              {(batch as any).certificate_templates?.name || 'Unknown template'}
                            </span>
                            <span>
                              {format(new Date(batch.created_at), 'MMM d, yyyy h:mm a')}
                            </span>
                          </CardDescription>
                        </div>
                        <div className="flex gap-2">
                          {batch.zip_url && (
                            <Button variant="outline" size="sm" asChild>
                              <a href={batch.zip_url} download>
                                <Download className="w-4 h-4 mr-1" />
                                Download All
                              </a>
                            </Button>
                          )}
                          <Button variant="outline" size="sm" onClick={() => navigate(`/history/${batch.id}`)}>
                            <Eye className="w-4 h-4 mr-1" />
                            Details
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-4 gap-4 mb-4">
                        <div>
                          <div className="text-2xl font-bold">{batch.total_count}</div>
                          <div className="text-xs text-muted-foreground">Total</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-primary">{batch.generated_count}</div>
                          <div className="text-xs text-muted-foreground">Generated</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-success">{batch.sent_count}</div>
                          <div className="text-xs text-muted-foreground">Sent</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-destructive">{batch.failed_count}</div>
                          <div className="text-xs text-muted-foreground">Failed</div>
                        </div>
                      </div>
                      {batch.status === 'processing' && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Progress</span>
                            <span>{progress}%</span>
                          </div>
                          <Progress value={progress} />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Clock className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No generation history</h3>
              <p className="text-muted-foreground text-center max-w-sm mb-4">
                You haven't generated any certificates yet. Start by selecting a template and uploading CSV data.
              </p>
              <Button onClick={() => navigate('/generate')}>
                Generate Certificates
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
