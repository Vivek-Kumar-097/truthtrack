// src/components/shared/PendingData.tsx

type Props = {
    message?: string
    day?: number
  }
  
  export function PendingData({
    message = 'Data not yet available',
    day,
  }: Props) {
    return (
      <div className="flex items-center gap-4 rounded-xl border border-yellow-500/20 bg-yellow-500/6 p-5">
        <span className="text-2xl">⏳</span>
        <div>
          <p className="font-semibold text-yellow-400">{message}</p>
          {day && (
            <p className="mt-0.5 font-mono text-xs text-zinc-500">
              Integrating MyNeta / EC affidavit source in Day {day}
            </p>
          )}
        </div>
      </div>
    )
  }