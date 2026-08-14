import { MessageSquare, User } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Comment {
  id: string
  author: string
  avatar?: string
  content: string
  createdAt: string
}

interface CommentThreadProps {
  comments: Comment[]
  className?: string
}

export function CommentThread({ comments, className }: CommentThreadProps) {
  if (comments.length === 0) return null

  return (
    <div className={cn('space-y-3', className)}>
      {comments.map((comment) => (
        <div key={comment.id} className="flex gap-3">
          <div className="shrink-0 w-7 h-7 rounded-full bg-raised border border-subtle flex items-center justify-center overflow-hidden">
            {comment.avatar ? (
              <img src={comment.avatar} alt={comment.author} className="w-full h-full object-cover" />
            ) : (
              <User size={14} className="text-text-tertiary" strokeWidth={1.5} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-medium text-text-primary">{comment.author}</span>
              <span className="text-[11px] text-text-muted">{comment.createdAt}</span>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">{comment.content}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

export function CommentCount({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
      <MessageSquare size={14} strokeWidth={1.5} />
      <span>{count} 条讨论</span>
    </div>
  )
}
