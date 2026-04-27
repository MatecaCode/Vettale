import React, { useState, useCallback } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ZoomIn, ZoomOut, RotateCw, Loader2 } from 'lucide-react';

interface PetPhotoCropperProps {
  open: boolean;
  imageSrc: string | null;
  onCancel: () => void;
  onConfirm: (croppedBlob: Blob) => void;
}

const MIME_TYPE = 'image/jpeg';
const OUTPUT_SIZE = 512;

async function getCroppedBlob(
  imageSrc: string,
  pixelCrop: Area,
  rotation: number
): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');

  // Handle rotation by drawing onto an intermediate canvas
  const radians = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  const rotW = image.width * cos + image.height * sin;
  const rotH = image.width * sin + image.height * cos;

  const rotCanvas = document.createElement('canvas');
  rotCanvas.width = rotW;
  rotCanvas.height = rotH;
  const rotCtx = rotCanvas.getContext('2d');
  if (!rotCtx) throw new Error('Canvas context unavailable');
  rotCtx.translate(rotW / 2, rotH / 2);
  rotCtx.rotate(radians);
  rotCtx.drawImage(image, -image.width / 2, -image.height / 2);

  ctx.drawImage(
    rotCanvas,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar imagem'))),
      MIME_TYPE,
      0.92
    );
  });
}

export const PetPhotoCropper: React.FC<PetPhotoCropperProps> = ({
  open,
  imageSrc,
  onCancel,
  onConfirm,
}) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pixelCrop, setPixelCrop] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setPixelCrop(areaPixels);
  }, []);

  const handleConfirm = async () => {
    if (!imageSrc || !pixelCrop) return;
    try {
      setProcessing(true);
      const blob = await getCroppedBlob(imageSrc, pixelCrop, rotation);
      onConfirm(blob);
    } catch (err) {
      console.error('Crop failed', err);
    } finally {
      setProcessing(false);
    }
  };

  const handleClose = () => {
    if (processing) return;
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setPixelCrop(null);
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-md p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-base">Ajustar foto</DialogTitle>
        </DialogHeader>

        <div className="relative w-full bg-black aspect-square">
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={onCropComplete}
            />
          )}
        </div>

        <div className="px-4 py-3 space-y-3 bg-white">
          <div className="flex items-center gap-3">
            <ZoomOut className="w-4 h-4 text-gray-500 shrink-0" />
            <Slider
              value={[zoom]}
              min={1}
              max={3}
              step={0.05}
              onValueChange={(v) => setZoom(v[0])}
              className="flex-1"
            />
            <ZoomIn className="w-4 h-4 text-gray-500 shrink-0" />
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              disabled={processing}
              className="gap-1.5"
            >
              <RotateCw className="w-3.5 h-3.5" />
              Girar
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClose}
                disabled={processing}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleConfirm}
                disabled={processing || !pixelCrop}
              >
                {processing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Salvando
                  </>
                ) : (
                  'Aplicar'
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PetPhotoCropper;
