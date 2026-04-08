// src/components/profile/SectionHeader.tsx

type Props = { children: string }

export function SectionHeader({ children }: Props) {
  return (
    <div className="mb-5 flex items-center gap-3 border-b border-white/10 pb-3">
      <p className="font-mono text-xs font-bold uppercase tracking-widest text-zinc-200">
        {children}
      </p>
      <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
    </div>
  )
}
