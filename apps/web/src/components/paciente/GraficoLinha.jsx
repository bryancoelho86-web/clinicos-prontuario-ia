import { LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

export default function GraficoLinha({ dados, nome }) {
  return (
    <ChartContainer config={{ valor: { label: nome, color: 'var(--heading-accent)' } }} className="h-48 w-full mb-4">
      <LineChart data={dados} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="data" tickLine={false} axisLine={false} fontSize={11} />
        <YAxis tickLine={false} axisLine={false} width={36} fontSize={11} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line type="monotone" dataKey="valor" stroke="var(--color-valor)" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ChartContainer>
  );
}
