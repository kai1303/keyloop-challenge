import { useState } from "react"
import { Input } from "@keyloop-interview/ui/components/input"
import { Label } from "@keyloop-interview/ui/components/label"
import { Slider } from "@keyloop-interview/ui/components/slider"
import { clampSliderValue } from "@keyloop-interview/ui/lib/slider-value"

type SliderFieldProps = {
  id: string
  label: string
  min: number
  max: number
  value: number
  onValueChange: (value: number) => void
  disabled?: boolean
}

function SliderField({ id, label, min, max, value, onValueChange, disabled }: SliderFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Label id={`${id}-label`} htmlFor={id}>{label}</Label>
        <Input id={id} type="number" inputMode="numeric" min={min} max={max} step={1}
          disabled={disabled} value={draft ?? value} className="w-36 text-right tabular-nums"
          aria-describedby={`${id}-bounds`}
          onChange={event => {
            setDraft(event.target.value)
            const next = event.target.valueAsNumber
            if (Number.isInteger(next) && next >= min && next <= max) onValueChange(next)
          }}
          onBlur={event => {
            onValueChange(clampSliderValue(event.target.valueAsNumber, min, max, value))
            setDraft(null)
          }} />
      </div>
      <Slider aria-labelledby={`${id}-label`} aria-describedby={`${id}-bounds`}
        min={min} max={max} step={1} value={[value]} disabled={disabled}
        onValueChange={([next]) => { setDraft(null); onValueChange(next) }} />
      <div id={`${id}-bounds`} className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{min.toLocaleString("en-GB")}</span><span>{max.toLocaleString("en-GB")}</span>
      </div>
    </div>
  )
}

export { SliderField }
