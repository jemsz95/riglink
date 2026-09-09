import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Camera, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAddNote, useCaptureEvidence } from './mutations'
import { toUserMessage } from '@/lib/supabase/errors'

/**
 * The two things a technician does on site: take a photo, write a note.
 *
 * Both are accepted into the local queue and confirmed immediately, whether or
 * not there is signal. Nothing here waits on the network, and nothing here can
 * fail because of it -- which is why the buttons never show a network error
 * and the banner, not this component, reports sending.
 */
export function EvidenceCapture({
  orgId,
  jobId,
  clientId,
  capturedBy,
}: {
  orgId: string
  jobId: string
  clientId: string
  capturedBy: string
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [note, setNote] = useState('')
  const capture = useCaptureEvidence()
  const addNote = useAddNote()

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    // Multiple selection is allowed, and each file is a separate queue entry
    // with its own client_ref, so one bad file cannot take the others down.
    for (const file of Array.from(files)) {
      try {
        await capture.mutateAsync({
          orgId,
          jobId,
          clientId,
          capturedBy,
          file,
          caption: null,
        })
      } catch (error) {
        toast.error(toUserMessage(error))
      }
    }
    toast.success(
      files.length === 1
        ? 'Photo saved to this device'
        : `${files.length} photos saved to this device`,
    )
    if (fileInput.current) fileInput.current.value = ''
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <input
          ref={fileInput}
          type="file"
          // `capture="environment"` asks iOS and Android for the rear camera
          // directly. `accept` still allows the photo library, because the
          // useful photo is often one taken before the app was opened.
          accept="image/*,application/pdf"
          capture="environment"
          multiple
          className="sr-only"
          onChange={(event) => void onFiles(event.target.files)}
        />
        <Button
          type="button"
          size="lg"
          // Big, because it is pressed with a glove on.
          className="h-14 w-full text-base"
          disabled={capture.isPending}
          onClick={() => fileInput.current?.click()}
        >
          {capture.isPending ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : (
            <Camera className="size-5" aria-hidden />
          )}
          Add photo
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="field-note">Note</Label>
        <Textarea
          id="field-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What did you find?"
          rows={3}
          className="text-base"
        />
        <Button
          type="button"
          variant="secondary"
          disabled={note.trim() === '' || addNote.isPending}
          onClick={async () => {
            try {
              await addNote.mutateAsync({
                orgId,
                jobId,
                clientId,
                capturedBy,
                body: note.trim(),
              })
              setNote('')
              toast.success('Note saved to this device')
            } catch (error) {
              toast.error(toUserMessage(error))
            }
          }}
          className="self-start"
        >
          <Send className="size-4" aria-hidden />
          Save note
        </Button>
      </div>
    </div>
  )
}
