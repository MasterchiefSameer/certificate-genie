import { useRef, useEffect, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Text } from 'react-konva';
import useImage from 'use-image';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Eye, ChevronLeft, ChevronRight } from 'lucide-react';

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
  max_width: number | null;
}

interface CertificatePreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: {
    id: string;
    name: string;
    image_url: string;
    image_width: number;
    image_height: number;
  } | null;
  templateFields: TemplateField[];
  csvData: Record<string, string>[];
  fieldMapping: Record<string, string>;
}

export default function CertificatePreview({
  open,
  onOpenChange,
  template,
  templateFields,
  csvData,
  fieldMapping,
}: CertificatePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [containerWidth, setContainerWidth] = useState(800);
  const [image] = useImage(template?.image_url || '', 'anonymous');

  // Calculate scale to fit container
  const templateWidth = template?.image_width || 800;
  const templateHeight = template?.image_height || 600;
  const scale = Math.min(containerWidth / templateWidth, 0.9);
  const scaledWidth = templateWidth * scale;
  const scaledHeight = templateHeight * scale;

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth - 48);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [open]);

  const currentRow = csvData[previewIndex] || {};

  const getFieldValue = (fieldKey: string) => {
    const csvColumn = fieldMapping[fieldKey];
    if (csvColumn && currentRow[csvColumn]) {
      return currentRow[csvColumn];
    }
    return `{{${fieldKey}}}`;
  };

  const handlePrev = () => {
    setPreviewIndex((i) => Math.max(0, i - 1));
  };

  const handleNext = () => {
    setPreviewIndex((i) => Math.min(csvData.length - 1, i + 1));
  };

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />
            Certificate Preview
          </DialogTitle>
          <DialogDescription>
            Preview how your certificate will look with actual data
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Record selector */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Label>Previewing record:</Label>
              <Select
                value={String(previewIndex)}
                onValueChange={(v) => setPreviewIndex(Number(v))}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {csvData.slice(0, 20).map((row, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {row[fieldMapping.name || Object.keys(row)[0]] || `Record ${i + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={handlePrev}
                disabled={previewIndex === 0}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {previewIndex + 1} of {csvData.length}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={handleNext}
                disabled={previewIndex >= csvData.length - 1}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Canvas preview */}
          <div
            ref={containerRef}
            className="border rounded-lg bg-muted/30 p-6 flex items-center justify-center overflow-hidden"
          >
            <div className="shadow-2xl rounded-lg overflow-hidden">
              <Stage width={scaledWidth} height={scaledHeight}>
                <Layer>
                  {/* Background image */}
                  {image && (
                    <KonvaImage
                      image={image}
                      width={scaledWidth}
                      height={scaledHeight}
                    />
                  )}

                  {/* Dynamic fields with actual data */}
                  {templateFields.map((field) => (
                    <Text
                      key={field.id}
                      x={field.x * scale}
                      y={field.y * scale}
                      text={getFieldValue(field.field_key)}
                      fontSize={field.font_size * scale}
                      fontFamily={field.font_family}
                      fill={field.font_color}
                      align={field.text_align as 'left' | 'center' | 'right'}
                      width={field.max_width ? field.max_width * scale : undefined}
                    />
                  ))}
                </Layer>
              </Stage>
            </div>
          </div>

          {/* Field values display */}
          <div className="grid grid-cols-2 gap-2 p-4 rounded-lg bg-muted/50">
            <div className="text-sm font-medium text-muted-foreground col-span-2 mb-1">
              Field Values for this Certificate:
            </div>
            {templateFields.map((field) => (
              <div key={field.id} className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{`{{${field.field_key}}}`}:</span>
                <span className="font-medium">{getFieldValue(field.field_key)}</span>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
