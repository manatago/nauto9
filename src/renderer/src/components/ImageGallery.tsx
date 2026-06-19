import { useRef, useState, type DragEvent } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Star, Trash2, Upload, Contrast } from 'lucide-react'
import type { CharacterImage } from '@shared/types'
import { REFERENCE_LIMIT } from '@shared/types'
import { api } from '../api'
import Modal from './Modal'

interface Props {
  images: CharacterImage[]
  onReorder: (ids: number[]) => void
  onToggleReference: (id: number) => void
  onUpdateCaption: (id: number, caption: string) => void
  onToggleGrayscale: (id: number) => void
  onDelete: (id: number) => void
  onUpload: (files: File[]) => void
}

function Card(props: {
  image: CharacterImage
  onToggleReference: () => void
  onUpdateCaption: (c: string) => void
  onToggleGrayscale: () => void
  onDelete: () => void
  onOpen: () => void
}): JSX.Element {
  const { image } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: image.id
  })
  const [caption, setCaption] = useState(image.caption ?? '')

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative rounded-lg border ${
        image.is_reference_enabled ? 'border-accent/70' : 'border-ink-600'
      } bg-ink-900 ${isDragging ? 'opacity-60' : ''}`}
    >
      <div
        className="aspect-[2/3] w-full cursor-grab overflow-hidden rounded-t-lg"
        title="クリックで拡大 / ドラッグで並び替え"
        onClick={props.onOpen}
        {...attributes}
        {...listeners}
      >
        <img
          src={image.thumbnail_url}
          className={`h-full w-full object-cover ${image.is_grayscale ? 'grayscale' : ''}`}
          draggable={false}
        />
      </div>
      <div className="flex items-center gap-1 px-1.5 py-1">
        <button
          title="参照画像にする"
          onClick={props.onToggleReference}
          className={`rounded p-1 ${
            image.is_reference_enabled
              ? 'text-accent'
              : 'text-ink-500 hover:text-ink-200'
          }`}
        >
          <Star size={15} fill={image.is_reference_enabled ? 'currentColor' : 'none'} />
        </button>
        <button
          title="グレースケール扱い"
          onClick={props.onToggleGrayscale}
          className={`rounded p-1 ${
            image.is_grayscale ? 'text-sky-300' : 'text-ink-500 hover:text-ink-200'
          }`}
        >
          <Contrast size={15} />
        </button>
        <button
          title="削除"
          onClick={props.onDelete}
          className="ml-auto rounded p-1 text-ink-500 hover:text-red-300"
        >
          <Trash2 size={15} />
        </button>
      </div>
      <input
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        onBlur={() => caption !== (image.caption ?? '') && props.onUpdateCaption(caption)}
        placeholder="caption"
        className="w-full rounded-b-lg border-t border-ink-700 bg-transparent px-2 py-1 text-[11px] text-ink-300 outline-none placeholder:text-ink-600"
      />
    </div>
  )
}

export default function ImageGallery(props: Props): JSX.Element {
  const fileRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const [fileDragOver, setFileDragOver] = useState(false)
  const [zoom, setZoom] = useState<CharacterImage | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const refCount = props.images.filter((i) => i.is_reference_enabled).length

  // Native file drag-and-drop (e.g. from Finder). A depth counter avoids the
  // flicker of dragenter/leave firing as the cursor crosses child elements.
  function hasFiles(dt: DataTransfer | null): boolean {
    return !!dt && Array.from(dt.types).includes('Files')
  }
  function onFileDragEnter(e: DragEvent): void {
    if (!hasFiles(e.dataTransfer)) return
    e.preventDefault()
    dragDepth.current += 1
    setFileDragOver(true)
  }
  function onFileDragOver(e: DragEvent): void {
    if (!hasFiles(e.dataTransfer)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }
  function onFileDragLeave(e: DragEvent): void {
    if (!hasFiles(e.dataTransfer)) return
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setFileDragOver(false)
    }
  }
  function onFileDrop(e: DragEvent): void {
    if (!hasFiles(e.dataTransfer)) return
    e.preventDefault()
    dragDepth.current = 0
    setFileDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    if (files.length) props.onUpload(files)
  }

  function onDragEnd(e: DragEndEvent): void {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = props.images.map((i) => i.id)
    const from = ids.indexOf(active.id as number)
    const to = ids.indexOf(over.id as number)
    props.onReorder(arrayMove(ids, from, to))
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-3 text-xs text-ink-500">
        <span>
          参照 {refCount}/{REFERENCE_LIMIT}
        </span>
        <button
          onClick={() => fileRef.current?.click()}
          className="ml-auto flex items-center gap-1.5 rounded-md border border-ink-600 px-2.5 py-1 text-ink-200 hover:border-accent/60 hover:text-accent"
        >
          <Upload size={14} /> 画像を追加
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            if (files.length) props.onUpload(files)
            e.target.value = ''
          }}
        />
      </div>
      <div
        onDragEnter={onFileDragEnter}
        onDragOver={onFileDragOver}
        onDragLeave={onFileDragLeave}
        onDrop={onFileDrop}
        className={`relative rounded-lg transition ${
          fileDragOver ? 'ring-2 ring-accent/70 ring-offset-2 ring-offset-ink-900' : ''
        }`}
      >
        {props.images.length === 0 ? (
          <div
            className={`rounded-lg border border-dashed py-12 text-center text-sm ${
              fileDragOver ? 'border-accent/70 text-accent' : 'border-ink-600 text-ink-600'
            }`}
          >
            画像をここにドラッグ&ドロップ、または「画像を追加」
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={props.images.map((i) => i.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
                {props.images.map((img) => (
                  <Card
                    key={img.id}
                    image={img}
                    onToggleReference={() => props.onToggleReference(img.id)}
                    onUpdateCaption={(c) => props.onUpdateCaption(img.id, c)}
                    onToggleGrayscale={() => props.onToggleGrayscale(img.id)}
                    onDelete={() => props.onDelete(img.id)}
                    onOpen={() => setZoom(img)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {fileDragOver && props.images.length > 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-ink-900/70 text-sm font-medium text-accent">
            ドロップで追加
          </div>
        )}
      </div>

      <Modal open={!!zoom} title="参照画像" onClose={() => setZoom(null)} wide>
        {zoom && (
          <div className="flex flex-col items-center gap-3">
            <img
              src={zoom.image_url}
              draggable
              onDragStart={(ev) => {
                ev.preventDefault()
                api.characterImages.dragOut(zoom.image_path)
              }}
              className={`max-h-[72vh] cursor-grab rounded-lg ${zoom.is_grayscale ? 'grayscale' : ''}`}
            />
            <p className="text-xs text-ink-500">
              画像をデスクトップ等へドラッグすると書き出せます
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
