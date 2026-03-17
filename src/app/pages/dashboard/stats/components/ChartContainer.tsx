// ============================================================
// ChartContainer — ECharts host container (SA-017)
// ============================================================
// Legacy stats.js renders ECharts into these containers.
// This component provides the mount points and handles resize.

import { useEffect, useRef } from 'react';
import { Card } from '@app/components';

interface ChartContainerProps {
  title: string;
  chartId: string;
  height?: string;
}

export function ChartContainer({ title, chartId, height = '320px' }: ChartContainerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Legacy code will find these containers by ID and render ECharts into them
    return () => {
      // Cleanup: dispose chart if legacy code left it
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const echarts = (window as any).echarts;
        if (echarts && ref.current) {
          const instance = echarts.getInstanceByDom(ref.current);
          if (instance) instance.dispose();
        }
      } catch {}
    };
  }, []);

  return (
    <Card variant="default" padding="md">
      <h3 className="text-sm font-semibold text-text mb-3">{title}</h3>
      <div
        ref={ref}
        id={chartId}
        className="w-full"
        style={{ height }}
      />
    </Card>
  );
}
