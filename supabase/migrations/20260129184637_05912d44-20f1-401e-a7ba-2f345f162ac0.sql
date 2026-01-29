-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Create certificate templates table
CREATE TABLE public.certificate_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT NOT NULL,
  image_width INTEGER NOT NULL DEFAULT 800,
  image_height INTEGER NOT NULL DEFAULT 600,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS on templates
ALTER TABLE public.certificate_templates ENABLE ROW LEVEL SECURITY;

-- Templates policies
CREATE POLICY "Users can view own templates" ON public.certificate_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own templates" ON public.certificate_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own templates" ON public.certificate_templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own templates" ON public.certificate_templates FOR DELETE USING (auth.uid() = user_id);

-- Create template fields table (stores dynamic field positions)
CREATE TABLE public.template_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES public.certificate_templates(id) ON DELETE CASCADE NOT NULL,
  field_key TEXT NOT NULL, -- e.g., 'name', 'designation', 'rank'
  label TEXT NOT NULL,
  x NUMERIC NOT NULL DEFAULT 0,
  y NUMERIC NOT NULL DEFAULT 0,
  font_size INTEGER NOT NULL DEFAULT 24,
  font_family TEXT NOT NULL DEFAULT 'Arial',
  font_color TEXT NOT NULL DEFAULT '#000000',
  text_align TEXT NOT NULL DEFAULT 'center',
  max_width INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS on fields
ALTER TABLE public.template_fields ENABLE ROW LEVEL SECURITY;

-- Fields policies (access through template ownership)
CREATE POLICY "Users can view fields of own templates" ON public.template_fields 
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.certificate_templates WHERE id = template_id AND user_id = auth.uid())
  );
CREATE POLICY "Users can insert fields to own templates" ON public.template_fields 
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.certificate_templates WHERE id = template_id AND user_id = auth.uid())
  );
CREATE POLICY "Users can update fields of own templates" ON public.template_fields 
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.certificate_templates WHERE id = template_id AND user_id = auth.uid())
  );
CREATE POLICY "Users can delete fields of own templates" ON public.template_fields 
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.certificate_templates WHERE id = template_id AND user_id = auth.uid())
  );

-- Create batch jobs table (for tracking certificate generation runs)
CREATE TABLE public.batch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  template_id UUID REFERENCES public.certificate_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  total_count INTEGER NOT NULL DEFAULT 0,
  generated_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  zip_url TEXT,
  csv_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS on batch jobs
ALTER TABLE public.batch_jobs ENABLE ROW LEVEL SECURITY;

-- Batch jobs policies
CREATE POLICY "Users can view own batch jobs" ON public.batch_jobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own batch jobs" ON public.batch_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own batch jobs" ON public.batch_jobs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own batch jobs" ON public.batch_jobs FOR DELETE USING (auth.uid() = user_id);

-- Create certificates table (individual generated certificates)
CREATE TABLE public.certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES public.batch_jobs(id) ON DELETE CASCADE NOT NULL,
  template_id UUID REFERENCES public.certificate_templates(id) ON DELETE SET NULL,
  recipient_name TEXT NOT NULL,
  recipient_email TEXT,
  recipient_data JSONB NOT NULL DEFAULT '{}',
  certificate_url TEXT,
  email_status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, failed
  email_sent_at TIMESTAMP WITH TIME ZONE,
  email_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS on certificates
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

-- Certificates policies (access through batch job ownership)
CREATE POLICY "Users can view certificates from own batches" ON public.certificates 
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.batch_jobs WHERE id = batch_id AND user_id = auth.uid())
  );
CREATE POLICY "Users can insert certificates to own batches" ON public.certificates 
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.batch_jobs WHERE id = batch_id AND user_id = auth.uid())
  );
CREATE POLICY "Users can update certificates in own batches" ON public.certificates 
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.batch_jobs WHERE id = batch_id AND user_id = auth.uid())
  );

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON public.certificate_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_fields_updated_at BEFORE UPDATE ON public.template_fields FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_batch_jobs_updated_at BEFORE UPDATE ON public.batch_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create profile automatically on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create storage bucket for certificate templates
INSERT INTO storage.buckets (id, name, public) VALUES ('certificates', 'certificates', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies for certificates bucket
CREATE POLICY "Users can upload certificate templates" ON storage.objects 
  FOR INSERT WITH CHECK (bucket_id = 'certificates' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view own certificate files" ON storage.objects 
  FOR SELECT USING (bucket_id = 'certificates' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own certificate files" ON storage.objects 
  FOR UPDATE USING (bucket_id = 'certificates' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own certificate files" ON storage.objects 
  FOR DELETE USING (bucket_id = 'certificates' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Public read access for generated certificates (so recipients can download)
CREATE POLICY "Public can view generated certificates" ON storage.objects 
  FOR SELECT USING (bucket_id = 'certificates' AND (storage.foldername(name))[2] = 'generated');