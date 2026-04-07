interface MasteryMeterProps {
  percentage: number; // 0-100
}

export default function MasteryMeter({percentage}: MasteryMeterProps) {
  return (
    <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/10 flex flex-col gap-6 w-16 items-center">
      <div className="flex flex-col-reverse gap-1 h-48 w-2 bg-surface-container-highest rounded-full overflow-hidden">
        <div
          className="w-full bg-gradient-to-t from-primary-container to-primary rounded-full transition-all duration-500"
          style={{height: `${percentage}%`}}
        />
      </div>
      <span className="text-[10px] font-bold text-outline uppercase writing-mode-vertical"
        style={{writingMode: 'vertical-rl', textOrientation: 'mixed'}}
      >
        Mastery
      </span>
    </div>
  );
}
