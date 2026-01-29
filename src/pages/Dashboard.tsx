import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  FileImage, 
  Send, 
  CheckCircle, 
  XCircle, 
  Plus,
  ArrowRight,
  TrendingUp
} from 'lucide-react';

export default function Dashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats', user?.id],
    queryFn: async () => {
      if (!user) return null;

      const [templatesRes, batchesRes, certificatesRes] = await Promise.all([
        supabase.from('certificate_templates').select('id', { count: 'exact', head: true }),
        supabase.from('batch_jobs').select('*'),
        supabase.from('certificates').select('email_status', { count: 'exact' }),
      ]);

      const batches = batchesRes.data || [];
      const totalGenerated = batches.reduce((acc, b) => acc + (b.generated_count || 0), 0);
      const totalSent = batches.reduce((acc, b) => acc + (b.sent_count || 0), 0);
      const totalFailed = batches.reduce((acc, b) => acc + (b.failed_count || 0), 0);

      return {
        templates: templatesRes.count || 0,
        totalGenerated,
        totalSent,
        totalFailed,
        recentBatches: batches.slice(0, 5),
      };
    },
    enabled: !!user,
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  const statCards = [
    {
      title: 'Templates',
      value: stats?.templates || 0,
      description: 'Certificate templates',
      icon: FileImage,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Generated',
      value: stats?.totalGenerated || 0,
      description: 'Total certificates',
      icon: TrendingUp,
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
    {
      title: 'Sent',
      value: stats?.totalSent || 0,
      description: 'Emails delivered',
      icon: CheckCircle,
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
    {
      title: 'Failed',
      value: stats?.totalFailed || 0,
      description: 'Delivery failures',
      icon: XCircle,
      color: 'text-destructive',
      bgColor: 'bg-destructive/10',
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Welcome back, {user.user_metadata?.full_name || 'there'}! Here's your overview.
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/templates/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Template
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat, index) => (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="stat-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{stat.value.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
              <Link to="/templates/new">
                <CardHeader>
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
                    <FileImage className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="flex items-center gap-2">
                    Create Template
                    <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </CardTitle>
                  <CardDescription>
                    Upload a certificate image and configure dynamic fields
                  </CardDescription>
                </CardHeader>
              </Link>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
              <Link to="/generate">
                <CardHeader>
                  <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center mb-2 group-hover:bg-success/20 transition-colors">
                    <Send className="w-6 h-6 text-success" />
                  </div>
                  <CardTitle className="flex items-center gap-2">
                    Generate & Send
                    <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </CardTitle>
                  <CardDescription>
                    Upload CSV and generate certificates for all recipients
                  </CardDescription>
                </CardHeader>
              </Link>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
              <Link to="/history">
                <CardHeader>
                  <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center mb-2 group-hover:bg-warning/20 transition-colors">
                    <TrendingUp className="w-6 h-6 text-warning" />
                  </div>
                  <CardTitle className="flex items-center gap-2">
                    View History
                    <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </CardTitle>
                  <CardDescription>
                    Track all your batch jobs and download certificates
                  </CardDescription>
                </CardHeader>
              </Link>
            </Card>
          </motion.div>
        </div>

        {/* Empty state for new users */}
        {stats?.templates === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
          >
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <FileImage className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No templates yet</h3>
                <p className="text-muted-foreground text-center max-w-sm mb-4">
                  Start by creating your first certificate template. Upload an image and configure where the dynamic fields should appear.
                </p>
                <Link to="/templates/new">
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Create your first template
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </DashboardLayout>
  );
}
