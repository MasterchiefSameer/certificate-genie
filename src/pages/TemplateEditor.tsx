import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Stage, Layer, Image as KonvaImage, Text, Transformer, Rect } from 'react-konva';
import useImage from 'use-image';
import Konva from 'konva';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { 
  Upload, 
  Plus, 
  Trash2, 
  Save, 
  ArrowLeft,
  Type,
  Palette,
  Move,
  GripVertical
} from 'lucide-react';

interface TemplateField {
  id: string;
  field_key: string;
  label: string;
  x: number;
  y: number;
  font_size: number;
  font_family: string;
  font_color: string;
  text_align: string;
  max_width?: number;
}

const FONTS = [
  'Arial',
  'Times New Roman',
  'Georgia',
  'Verdana',
  'Courier New',
  'Trebuchet MS',
  'Impact',
];

const FIELD_PRESETS = [
  { key: 'name', label: 'Participant Name' },
  { key: 'designation', label: 'Designation' },
  { key: 'rank', label: 'Rank' },
  { key: 'date', label: 'Date' },
  { key: 'course', label: 'Course Name' },
  { key: 'organization', label: 'Organization' },
];

export default function TemplateEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageDimensions, setImageDimensions] = useState({ width: 800, height: 600 });
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [image] = useImage(imageUrl, 'anonymous');

  const isEditMode = !!id;

  // Fetch existing template
  const { data: existingTemplate, isLoading: templateLoading } = useQuery({
    queryKey: ['template', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('certificate_templates')
        .select('*, template_fields(*)')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!user,
  });

  // Populate form with existing data
  useEffect(() => {
    if (existingTemplate) {
      setTemplateName(existingTemplate.name);
      setTemplateDescription(existingTemplate.description || '');
      setImageUrl(existingTemplate.image_url);
      setImageDimensions({
        width: existingTemplate.image_width,
        height: existingTemplate.image_height,
      });
      setFields(
        (existingTemplate.template_fields as TemplateField[]).map((f) => ({
          ...f,
          x: Number(f.x),
          y: Number(f.y),
        }))
      );
    }
  }, [existingTemplate]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  // Handle image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Error', description: 'Please upload an image file', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/templates/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('certificates')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('certificates')
        .getPublicUrl(fileName);

      // Get image dimensions
      const img = document.createElement('img');
      img.onload = () => {
        setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
        setImageUrl(publicUrl);
        setUploading(false);
      };
      img.onerror = () => {
        setImageUrl(publicUrl);
        setUploading(false);
      };
      img.src = publicUrl;
    } catch (error: any) {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
      setUploading(false);
    }
  };

  // Add a new field
  const addField = (preset?: typeof FIELD_PRESETS[0]) => {
    const newField: TemplateField = {
      id: `temp-${Date.now()}`,
      field_key: preset?.key || 'custom',
      label: preset?.label || 'Custom Field',
      x: imageDimensions.width / 2,
      y: imageDimensions.height / 2,
      font_size: 32,
      font_family: 'Arial',
      font_color: '#000000',
      text_align: 'center',
    };
    setFields([...fields, newField]);
    setSelectedFieldId(newField.id);
  };

  // Update field
  const updateField = (fieldId: string, updates: Partial<TemplateField>) => {
    setFields(fields.map(f => f.id === fieldId ? { ...f, ...updates } : f));
  };

  // Remove field
  const removeField = (fieldId: string) => {
    setFields(fields.filter(f => f.id !== fieldId));
    if (selectedFieldId === fieldId) setSelectedFieldId(null);
  };

  // Handle drag end
  const handleDragEnd = (fieldId: string, e: Konva.KonvaEventObject<DragEvent>) => {
    updateField(fieldId, {
      x: e.target.x(),
      y: e.target.y(),
    });
  };

  // Save template
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user || !imageUrl || !templateName) {
        throw new Error('Missing required fields');
      }

      setSaving(true);

      let templateId = id;

      if (isEditMode && id) {
        // Update existing template
        const { error } = await supabase
          .from('certificate_templates')
          .update({
            name: templateName,
            description: templateDescription,
            image_url: imageUrl,
            image_width: imageDimensions.width,
            image_height: imageDimensions.height,
          })
          .eq('id', id);

        if (error) throw error;

        // Delete existing fields
        await supabase.from('template_fields').delete().eq('template_id', id);
      } else {
        // Create new template
        const { data, error } = await supabase
          .from('certificate_templates')
          .insert({
            user_id: user.id,
            name: templateName,
            description: templateDescription,
            image_url: imageUrl,
            image_width: imageDimensions.width,
            image_height: imageDimensions.height,
          })
          .select()
          .single();

        if (error) throw error;
        templateId = data.id;
      }

      // Insert fields
      if (fields.length > 0 && templateId) {
        const { error: fieldsError } = await supabase
          .from('template_fields')
          .insert(
            fields.map(f => ({
              template_id: templateId,
              field_key: f.field_key,
              label: f.label,
              x: f.x,
              y: f.y,
              font_size: f.font_size,
              font_family: f.font_family,
              font_color: f.font_color,
              text_align: f.text_align,
              max_width: f.max_width,
            }))
          );

        if (fieldsError) throw fieldsError;
      }

      return templateId;
    },
    onSuccess: () => {
      setSaving(false);
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast({ title: 'Saved', description: 'Template saved successfully' });
      navigate('/templates');
    },
    onError: (error: any) => {
      setSaving(false);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const selectedField = fields.find(f => f.id === selectedFieldId);

  // Calculate scale to fit canvas
  const maxWidth = 800;
  const maxHeight = 500;
  const scale = Math.min(maxWidth / imageDimensions.width, maxHeight / imageDimensions.height, 1);

  if (authLoading || templateLoading) {
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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/templates')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {isEditMode ? 'Edit Template' : 'Create Template'}
            </h1>
            <p className="text-muted-foreground">
              {isEditMode ? 'Update your certificate template' : 'Upload an image and configure field positions'}
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left sidebar - Template info & Fields */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Template Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Template Name</Label>
                  <Input
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g., Course Completion Certificate"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Input
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    placeholder="Brief description"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Type className="w-4 h-4" />
                  Dynamic Fields
                </CardTitle>
                <CardDescription>
                  Add fields that will be replaced with CSV data
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {FIELD_PRESETS.map((preset) => (
                    <Button
                      key={preset.key}
                      variant="outline"
                      size="sm"
                      onClick={() => addField(preset)}
                      disabled={!imageUrl}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      {preset.label}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => addField()}
                  disabled={!imageUrl}
                  className="w-full"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Custom Field
                </Button>

                {/* Field list */}
                <div className="space-y-2 mt-4">
                  {fields.map((field) => (
                    <div
                      key={field.id}
                      className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                        selectedFieldId === field.id
                          ? 'border-primary bg-accent'
                          : 'border-border hover:bg-muted'
                      }`}
                      onClick={() => setSelectedFieldId(field.id)}
                    >
                      <GripVertical className="w-4 h-4 text-muted-foreground" />
                      <span className="flex-1 text-sm truncate">{field.label}</span>
                      <code className="text-xs bg-muted px-1 rounded">{`{{${field.field_key}}}`}</code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeField(field.id);
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Field properties */}
            {selectedField && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Palette className="w-4 h-4" />
                    Field Properties
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Field Key (for CSV)</Label>
                    <Input
                      value={selectedField.field_key}
                      onChange={(e) => updateField(selectedField.id, { field_key: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Display Label</Label>
                    <Input
                      value={selectedField.label}
                      onChange={(e) => updateField(selectedField.id, { label: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Font Family</Label>
                    <Select
                      value={selectedField.font_family}
                      onValueChange={(v) => updateField(selectedField.id, { font_family: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FONTS.map((font) => (
                          <SelectItem key={font} value={font}>{font}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Font Size: {selectedField.font_size}px</Label>
                    <Slider
                      value={[selectedField.font_size]}
                      onValueChange={([v]) => updateField(selectedField.id, { font_size: v })}
                      min={12}
                      max={120}
                      step={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Color</Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={selectedField.font_color}
                        onChange={(e) => updateField(selectedField.id, { font_color: e.target.value })}
                        className="w-12 h-10 p-1"
                      />
                      <Input
                        value={selectedField.font_color}
                        onChange={(e) => updateField(selectedField.id, { font_color: e.target.value })}
                        className="flex-1"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Text Align</Label>
                    <Select
                      value={selectedField.text_align}
                      onValueChange={(v) => updateField(selectedField.id, { text_align: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="left">Left</SelectItem>
                        <SelectItem value="center">Center</SelectItem>
                        <SelectItem value="right">Right</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label>X Position</Label>
                      <Input
                        type="number"
                        value={Math.round(selectedField.x)}
                        onChange={(e) => updateField(selectedField.id, { x: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Y Position</Label>
                      <Input
                        type="number"
                        value={Math.round(selectedField.y)}
                        onChange={(e) => updateField(selectedField.id, { y: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Main canvas area */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardContent className="p-4">
                {!imageUrl ? (
                  <div
                    className="border-2 border-dashed border-border rounded-lg p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">Upload Certificate Template</h3>
                    <p className="text-muted-foreground mb-4">
                      PNG, JPG, or PDF up to 10MB
                    </p>
                    <Button disabled={uploading}>
                      {uploading ? 'Uploading...' : 'Choose File'}
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Move className="w-4 h-4" />
                        Drag fields to position them on the certificate
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Replace Image
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </div>
                    
                    <div className="canvas-container flex items-center justify-center" style={{ minHeight: maxHeight + 40 }}>
                      <Stage
                        ref={stageRef}
                        width={imageDimensions.width * scale}
                        height={imageDimensions.height * scale}
                        scaleX={scale}
                        scaleY={scale}
                        onMouseDown={(e) => {
                          if (e.target === e.target.getStage()) {
                            setSelectedFieldId(null);
                          }
                        }}
                      >
                        <Layer>
                          {image && (
                            <KonvaImage
                              image={image}
                              width={imageDimensions.width}
                              height={imageDimensions.height}
                            />
                          )}
                          {fields.map((field) => (
                            <Text
                              key={field.id}
                              x={field.x}
                              y={field.y}
                              text={`{{${field.field_key}}}`}
                              fontSize={field.font_size}
                              fontFamily={field.font_family}
                              fill={field.font_color}
                              align={field.text_align as 'left' | 'center' | 'right'}
                              draggable
                              onClick={() => setSelectedFieldId(field.id)}
                              onTap={() => setSelectedFieldId(field.id)}
                              onDragEnd={(e) => handleDragEnd(field.id, e)}
                              offsetX={
                                field.text_align === 'center'
                                  ? field.font_size * field.field_key.length * 0.3
                                  : field.text_align === 'right'
                                  ? field.font_size * field.field_key.length * 0.6
                                  : 0
                              }
                              stroke={selectedFieldId === field.id ? '#6366f1' : undefined}
                              strokeWidth={selectedFieldId === field.id ? 2 : 0}
                            />
                          ))}
                        </Layer>
                      </Stage>
                    </div>
                    
                    <p className="text-xs text-muted-foreground text-center">
                      Template size: {imageDimensions.width} × {imageDimensions.height}px
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Save button */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => navigate('/templates')}>
                Cancel
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saving || !imageUrl || !templateName}
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'Save Template'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
