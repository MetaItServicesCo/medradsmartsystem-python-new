/**
 * The hospital documents the assistant can quote.
 *
 * Policies, procedures and equipment manuals, uploaded as PDF, Word or text.
 * A document belongs either to one site - its own fire evacuation plan - or to
 * every site, and a question asked inside a site only draws on that site's
 * documents and the shared ones. The assistant cites the document and page.
 */
import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { toast } from 'react-toastify'
import {
  deleteKnowledgeDocument, fetchKnowledgeDocuments, uploadKnowledgeDocument, type KnowledgeDocument,
} from '@/api/assistant'
import { useActiveFacility } from '@/hooks/useActiveFacility'
import { useAuthStore } from '@/stores/authStore'
import { palette } from '@/theme/palette'

const errorText = (e: any, fallback: string) =>
  typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : fallback

export default function AssistantDocumentsPage() {
  const user = useAuthStore((s) => s.user)
  const { facilityId, facility } = useActiveFacility()
  const queryClient = useQueryClient()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [removing, setRemoving] = useState<KnowledgeDocument | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['assistant-documents', facilityId],
    queryFn: () => fetchKnowledgeDocuments(facilityId),
    enabled: user?.role === 'superadmin',
  })
  const documents = data?.items ?? []

  const remove = useMutation({
    mutationFn: (doc: KnowledgeDocument) => deleteKnowledgeDocument(doc.doc_id),
    onSuccess: () => {
      toast.success('Removed; the assistant no longer quotes it')
      queryClient.invalidateQueries({ queryKey: ['assistant-documents'] })
      setRemoving(null)
    },
    onError: (e: any) => toast.error(errorText(e, 'Could not remove it')),
  })

  if (user?.role !== 'superadmin') {
    return (
      <Alert severity="info" sx={{ borderRadius: '12px' }}>
        Assistant documents are managed by Super Admins.
      </Alert>
    )
  }

  return (
    <Box className="page-enter" sx={{ width: '100%', minWidth: 0 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }}
             sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 1.5, mb: 2.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" sx={{ fontWeight: 900, color: palette.ink }}>Assistant documents</Typography>
          <Typography sx={{ color: palette.textMuted, fontWeight: 700 }}>
            Policies, procedures and manuals the assistant can quote, with the page it came from
          </Typography>
        </Box>
        <Button
          variant="contained" startIcon={<UploadFileIcon />} onClick={() => setUploadOpen(true)}
          sx={{ fontWeight: 900, borderRadius: '12px', px: 2.5, bgcolor: palette.brand,
                '&:hover': { bgcolor: palette.brandDeep } }}
        >
          Upload document
        </Button>
      </Stack>

      <Box sx={{ border: `1px solid ${palette.borderSoft}`, borderRadius: '18px', bgcolor: palette.white }}>
        <Box sx={{ px: 2, py: 1.25, borderBottom: `1px solid ${palette.borderSoft}` }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: palette.textFaint }}>
            {facility ? `Shown for ${facility.name}: its own documents and those shared by every site`
                      : 'Every document'}
          </Typography>
        </Box>
        {isLoading && <Box sx={{ p: 5, textAlign: 'center' }}><CircularProgress size={24} /></Box>}
        {!isLoading && !documents.length && (
          <Box sx={{ p: 5, textAlign: 'center' }}>
            <Typography sx={{ fontWeight: 800, color: palette.textMuted }}>No documents yet</Typography>
            <Typography sx={{ mt: 0.5, fontSize: 13, color: palette.textFaint, maxWidth: 480, mx: 'auto' }}>
              Upload an evacuation plan, an infection control policy or a generator test procedure,
              then ask the assistant about it. It answers from the document and says which page.
            </Typography>
          </Box>
        )}
        {documents.map((doc) => (
          <Stack key={doc.doc_id} direction="row" alignItems="center" spacing={1.5}
                 sx={{ px: 2, py: 1.4, borderBottom: `1px solid ${palette.borderSoft}` }}>
            <DescriptionOutlinedIcon sx={{ color: palette.brand }} />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography noWrap sx={{ fontWeight: 900, color: palette.ink, fontSize: 14 }}>{doc.title}</Typography>
              <Typography noWrap sx={{ fontSize: 12, color: palette.textMuted }}>
                {[doc.filename, `${doc.passages} passages`, doc.uploaded_by,
                  doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : null]
                  .filter(Boolean).join(' · ')}
              </Typography>
            </Box>
            <Chip size="small" label={doc.site}
                  sx={{ fontWeight: 800, bgcolor: doc.facility_id ? palette.brandTint : palette.surfaceMuted,
                        color: doc.facility_id ? palette.brandDeep : palette.textSubtle }} />
            <Tooltip title="Remove">
              <IconButton size="small" onClick={() => setRemoving(doc)}>
                <DeleteOutlineIcon sx={{ fontSize: 19, color: palette.textFaint }} />
              </IconButton>
            </Tooltip>
          </Stack>
        ))}
      </Box>

      {uploadOpen && (
        <UploadDialog
          siteId={facilityId ?? null} siteName={facility?.name}
          onClose={() => setUploadOpen(false)}
          onDone={() => { setUploadOpen(false); queryClient.invalidateQueries({ queryKey: ['assistant-documents'] }) }}
        />
      )}

      <Dialog open={!!removing} onClose={() => setRemoving(null)} maxWidth="xs" fullWidth
              PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ fontWeight: 900 }}>Remove {removing?.title}?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13.5, color: palette.textMuted }}>
            The assistant stops quoting it straight away. Upload it again to bring it back.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRemoving(null)} sx={{ fontWeight: 800, color: palette.textMuted }}>Cancel</Button>
          <Button color="error" variant="contained" disabled={remove.isPending}
                  onClick={() => removing && remove.mutate(removing)} sx={{ fontWeight: 900, borderRadius: '10px' }}>
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

function UploadDialog({ siteId, siteName, onClose, onDone }: {
  siteId: number | null
  siteName?: string
  onClose: () => void
  onDone: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [scope, setScope] = useState<'site' | 'all'>(siteId ? 'site' : 'all')

  const upload = useMutation({
    mutationFn: () => uploadKnowledgeDocument(file as File, {
      title: title.trim() || undefined,
      facilityId: scope === 'site' ? siteId : null,
    }),
    onSuccess: (doc) => {
      toast.success(`${doc.title} added: ${doc.passages} passages the assistant can quote`)
      onDone()
    },
    onError: (e: any) => toast.error(errorText(e, 'Could not add that document')),
  })

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
      <DialogTitle sx={{ fontWeight: 900, color: palette.ink }}>Upload a document</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <input ref={input} type="file" hidden accept=".pdf,.docx,.txt,.md"
                 onChange={(e) => {
                   const chosen = e.target.files?.[0] ?? null
                   setFile(chosen)
                   if (chosen && !title) setTitle(chosen.name.replace(/\.[a-z]+$/i, ''))
                 }} />
          <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => input.current?.click()}
                  sx={{ fontWeight: 800, borderRadius: '10px', justifyContent: 'flex-start' }}>
            {file ? file.name : 'Choose a PDF, Word document or text file'}
          </Button>
          <TextField size="small" label="Title" value={title} onChange={(e) => setTitle(e.target.value)}
                     helperText="How the assistant names it when quoting, e.g. Fire Evacuation Plan" />
          <TextField select size="small" label="Applies to" value={scope}
                     onChange={(e) => setScope(e.target.value as 'site' | 'all')}>
            {siteId && <MenuItem value="site">{siteName ?? 'This site'} only</MenuItem>}
            <MenuItem value="all">Every site</MenuItem>
          </TextField>
          <Typography sx={{ fontSize: 12, color: palette.textFaint }}>
            Up to 15 MB. Only the text is kept. A scanned PDF needs text recognition first.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} sx={{ fontWeight: 800, color: palette.textMuted }}>Cancel</Button>
        <Button variant="contained" disabled={!file || upload.isPending} onClick={() => upload.mutate()}
                sx={{ fontWeight: 900, borderRadius: '10px' }}>
          {upload.isPending ? 'Reading…' : 'Upload'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
