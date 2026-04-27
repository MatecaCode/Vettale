import React, { useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import PetPhotoCropper from './PetPhotoCropper';

interface PetPhotoUploadProps {
  userId: string;
  petId?: string;
  currentPhotoUrl?: string | null;
  onPhotoChange: (url: string | null) => void;
  petName?: string;
}

const MAX_SIZE_MB = 5;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function PetPhotoUpload({
  userId,
  petId,
  currentPhotoUrl,
  onPhotoChange,
  petName,
}: PetPhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentPhotoUrl ?? null);
  const [isUploading, setIsUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  const uploadBlob = async (blob: Blob, ext: string) => {
    setIsUploading(true);
    const localUrl = URL.createObjectURL(blob);
    setPreview(localUrl);
    try {
      const filename = petId ?? `temp_${Date.now()}`;
      const path = `${userId}/${filename}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('pet-photos')
        .upload(path, blob, { upsert: true, contentType: blob.type });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('pet-photos').getPublicUrl(path);
      const publicUrl = `${data.publicUrl}?t=${Date.now()}`;
      onPhotoChange(publicUrl);
      setPreview(publicUrl);
      toast.success('Foto salva!');
    } catch (err: any) {
      toast.error('Erro ao enviar foto: ' + err.message);
      setPreview(currentPhotoUrl ?? null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFile = (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Formato não suportado. Use JPG, PNG, WEBP ou GIF.');
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`A foto deve ter no máximo ${MAX_SIZE_MB}MB.`);
      return;
    }

    // Open cropper instead of uploading directly
    const url = URL.createObjectURL(file);
    setCropSrc(url);
  };

  const handleCropConfirm = async (blob: Blob) => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    await uploadBlob(blob, 'jpg');
  };

  const handleCropCancel = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  };

  const handleRemove = async () => {
    if (!preview) return;
    setPreview(null);
    onPhotoChange(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={cn(
          'relative group w-40 h-40 rounded-full overflow-hidden border-2 border-dashed transition-all duration-200 cursor-pointer',
          preview
            ? 'border-transparent shadow-md'
            : 'border-gray-300 hover:border-[#6BAEDB] bg-gray-50 hover:bg-[#E7F0FF]/50'
        )}
        onClick={() => !isUploading && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {preview ? (
          <>
              <img
              src={preview}
              alt={petName ?? 'Foto do pet'}
              className="w-full h-full object-cover"
            />
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
              <Camera className="w-7 h-7 text-white" />
            </div>
          </>
        ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-gray-400 group-hover:text-[#2B70B2] transition-colors">
            <Camera className="w-10 h-10" />
            <span className="text-xs font-medium text-center leading-tight px-2">
              Adicionar foto
            </span>
          </div>
        )}

        {isUploading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-full">
            <Loader2 className="w-6 h-6 text-[#2B70B2] animate-spin" />
          </div>
        )}
      </div>

      {preview && !isUploading && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1 text-xs text-[#2B70B2] hover:text-[#1d5687] transition-colors"
          >
            <Camera className="w-3 h-3" />
            Alterar foto
          </button>
          <button
            type="button"
            onClick={handleRemove}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            <X className="w-3 h-3" />
            Remover foto
          </button>
        </div>
      )}

      <p className="text-[11px] text-gray-400 text-center">
        JPG, PNG ou WEBP · máx. 5 MB
      </p>

      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />

      <PetPhotoCropper
        open={!!cropSrc}
        imageSrc={cropSrc}
        onCancel={handleCropCancel}
        onConfirm={handleCropConfirm}
      />
    </div>
  );
}
