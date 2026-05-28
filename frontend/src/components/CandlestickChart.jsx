import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

export default function CandlestickChart({ historicalData, activeSymbol }) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [tooltipData, setTooltipData] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Calculation helpers for overlay indicators
  const calculateSMA = (data, period = 20) => {
    return data.map((d, i) => {
      if (i < period - 1) return { ...d, sma: null };
      const slice = data.slice(i - period + 1, i + 1);
      const sum = slice.reduce((acc, curr) => acc + curr.close, 0);
      return { ...d, sma: sum / period };
    });
  };

  const calculateEMA = (data, period = 50) => {
    let prevEma = null;
    const k = 2 / (period + 1);
    
    return data.map((d, i) => {
      if (i < period - 1) return { ...d, ema: null };
      if (i === period - 1) {
        const slice = data.slice(0, period);
        const sum = slice.reduce((acc, curr) => acc + curr.close, 0);
        prevEma = sum / period;
        return { ...d, ema: prevEma };
      }
      const ema = d.close * k + prevEma * (1 - k);
      prevEma = ema;
      return { ...d, ema };
    });
  };

  useEffect(() => {
    if (!historicalData || historicalData.length === 0 || !containerRef.current) return;

    // Process data and apply overlay indicators
    let processedData = historicalData.map(d => ({
      ...d,
      date: new Date(d.bucket),
      open: parseFloat(d.open),
      high: parseFloat(d.high),
      low: parseFloat(d.low),
      close: parseFloat(d.close),
      volume: parseInt(d.volume)
    }));

    processedData = calculateSMA(processedData, 10); // 10-period SMA
    processedData = calculateEMA(processedData, 20); // 20-period EMA

    // Set Dimensions
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight || 450;
    
    const margin = { top: 20, right: 60, bottom: 80, left: 20 };
    const width = containerWidth - margin.left - margin.right;
    const height = containerHeight - margin.top - margin.bottom;
    
    // Volume sub-chart height mapping
    const volumeHeight = 60;
    const mainChartHeight = height - volumeHeight - 20;

    // Clear existing SVG drawing
    d3.select(svgRef.current).selectAll('*').remove();

    // Create primary SVG node
    const svg = d3.select(svgRef.current)
      .attr('width', containerWidth)
      .attr('height', containerHeight)
      .append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);

    // Define X scale (Time)
    const xScale = d3.scaleBand()
      .domain(processedData.map(d => d.date))
      .range([0, width])
      .padding(0.3);

    // Define Y scale for Prices
    const yMin = d3.min(processedData, d => d.low) * 0.998;
    const yMax = d3.max(processedData, d => d.high) * 1.002;
    const yScale = d3.scaleLinear()
      .domain([yMin, yMax])
      .range([mainChartHeight, 0]);

    // Define Y scale for Volumes
    const maxVolume = d3.max(processedData, d => d.volume) || 1000;
    const yVolumeScale = d3.scaleLinear()
      .domain([0, maxVolume])
      .range([height, height - volumeHeight]);

    // Gridlines Helper
    const makeYGridlines = () => d3.axisLeft(yScale).ticks(8);
    const makeXGridlines = () => d3.axisBottom(xScale).ticks(10);

    // Add Gridlines
    svg.append('g')
      .attr('class', 'grid')
      .attr('stroke', 'rgba(255, 255, 255, 0.03)')
      .attr('stroke-width', 1)
      .call(makeYGridlines()
        .tickSize(-width)
        .tickFormat('')
      );

    // Render X Axis (Dates / Times)
    const xAxis = d3.axisBottom(xScale)
      .tickFormat(d3.timeFormat('%H:%M'))
      .tickValues(xScale.domain().filter((d, i) => i % Math.max(1, Math.floor(processedData.length / 8)) === 0));

    svg.append('g')
      .attr('transform', `translate(0, ${height})`)
      .attr('color', 'var(--text-dark)')
      .call(xAxis)
      .selectAll('text')
      .style('fill', 'var(--text-muted)')
      .style('font-size', '10px');

    // Render Y Axis (Prices) - Right Side
    const yAxis = d3.axisRight(yScale)
      .tickFormat(d3.format('$.2f'))
      .ticks(8);

    svg.append('g')
      .attr('transform', `translate(${width}, 0)`)
      .attr('color', 'var(--text-dark)')
      .call(yAxis)
      .selectAll('text')
      .style('fill', 'var(--text-muted)')
      .style('font-size', '10px');

    // Drawing Candlesticks
    const candlesGroup = svg.append('g').attr('class', 'candles');

    // 1. Draw thin low/high shadow lines
    candlesGroup.selectAll('.stem')
      .data(processedData)
      .enter()
      .append('line')
      .attr('class', 'stem')
      .attr('x1', d => xScale(d.date) + xScale.bandwidth() / 2)
      .attr('x2', d => xScale(d.date) + xScale.bandwidth() / 2)
      .attr('y1', d => yScale(d.high))
      .attr('y2', d => yScale(d.low))
      .attr('stroke', d => d.close >= d.open ? 'var(--trend-up)' : 'var(--trend-down)')
      .attr('stroke-width', 1.5);

    // 2. Draw candles body rectangles
    candlesGroup.selectAll('.candle')
      .data(processedData)
      .enter()
      .append('rect')
      .attr('class', 'candle')
      .attr('x', d => xScale(d.date))
      .attr('y', d => yScale(Math.max(d.open, d.close)))
      .attr('width', xScale.bandwidth())
      .attr('height', d => Math.max(1.5, Math.abs(yScale(d.open) - yScale(d.close))))
      .attr('fill', d => d.close >= d.open ? 'var(--trend-up)' : 'var(--trend-down)')
      .attr('rx', 1.5);

    // Volume bars sub-chart
    const volumeGroup = svg.append('g').attr('class', 'volume');
    volumeGroup.selectAll('.volume-bar')
      .data(processedData)
      .enter()
      .append('rect')
      .attr('class', 'volume-bar')
      .attr('x', d => xScale(d.date))
      .attr('y', d => yVolumeScale(d.volume))
      .attr('width', xScale.bandwidth())
      .attr('height', d => height - yVolumeScale(d.volume))
      .attr('fill', d => d.close >= d.open ? 'var(--trend-up)' : 'var(--trend-down)')
      .attr('opacity', 0.25);

    // Overlays: Moving Averages Line Drawing
    
    // SMA-10 (Cyan line)
    const smaLine = d3.line()
      .defined(d => d.sma !== null)
      .x(d => xScale(d.date) + xScale.bandwidth() / 2)
      .y(d => yScale(d.sma));

    svg.append('path')
      .datum(processedData)
      .attr('fill', 'none')
      .attr('stroke', 'var(--accent-secondary)')
      .attr('stroke-width', 1.5)
      .attr('opacity', 0.8)
      .attr('d', smaLine);

    // EMA-20 (Indigo line)
    const emaLine = d3.line()
      .defined(d => d.ema !== null)
      .x(d => xScale(d.date) + xScale.bandwidth() / 2)
      .y(d => yScale(d.ema));

    svg.append('path')
      .datum(processedData)
      .attr('fill', 'none')
      .attr('stroke', 'var(--accent-primary)')
      .attr('stroke-width', 1.5)
      .attr('opacity', 0.8)
      .attr('d', emaLine);

    // INTERACTIVE CROSSHAIR & TOOLTIPS
    const crosshair = svg.append('g').style('display', 'none');
    
    // Horizontal tracking line
    const crosshairY = crosshair.append('line')
      .attr('stroke', 'rgba(255, 255, 255, 0.2)')
      .attr('stroke-dasharray', '3,3')
      .attr('x1', 0)
      .attr('x2', width);
      
    // Vertical tracking line
    const crosshairX = crosshair.append('line')
      .attr('stroke', 'rgba(255, 255, 255, 0.2)')
      .attr('stroke-dasharray', '3,3')
      .attr('y1', 0)
      .attr('y2', height);

    // Hover area overlays
    const hoverArea = svg.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'transparent');

    hoverArea
      .on('mouseover', () => crosshair.style('display', null))
      .on('mouseout', () => {
        crosshair.style('display', 'none');
        setTooltipData(null);
      })
      .on('mousemove', (event) => {
        const [mouseX, mouseY] = d3.pointer(event);
        
        // Calculate nearest band date
        const eachBandWidth = xScale.step();
        const index = Math.floor(mouseX / eachBandWidth);
        
        if (index >= 0 && index < processedData.length) {
          const d = processedData[index];
          const cx = xScale(d.date) + xScale.bandwidth() / 2;
          const cy = yScale(d.close);

          // Update crosshair lines
          crosshairX.attr('x1', cx).attr('x2', cx);
          crosshairY.attr('y1', mouseY).attr('y2', mouseY);

          // Set active Tooltip
          setTooltipData(d);
          
          // Position tooltip intelligently (away from mouse cursor)
          const scrollOffset = window.scrollY || 0;
          const rect = svgRef.current.getBoundingClientRect();
          const tooltipX = rect.left + cx + 20;
          const tooltipY = rect.top + mouseY - 40 + scrollOffset;

          setTooltipPos({ 
            x: tooltipX > window.innerWidth - 200 ? rect.left + cx - 180 : tooltipX,
            y: tooltipY 
          });
        }
      });

  }, [historicalData, activeSymbol]);

  return (
    <div className="chart-container-wrapper" ref={containerRef}>
      
      {/* Dynamic Overlay Key */}
      <div style={{ display: 'flex', gap: '16px', fontSize: '11px', marginBottom: '8px', color: 'var(--text-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-secondary)' }}></span>
          SMA (10)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-primary)' }}></span>
          EMA (20)
        </div>
      </div>

      <svg ref={svgRef} className="chart-svg-container"></svg>

      {/* Floating Dynamic HTML Tooltip */}
      {tooltipData && (
        <div 
          className="d3-tooltip"
          style={{ 
            left: `${tooltipPos.x}px`, 
            top: `${tooltipPos.y}px`,
            position: 'fixed' 
          }}
        >
          <div style={{ fontWeight: '600', color: 'var(--accent-secondary)', marginBottom: '4px', fontFamily: 'var(--font-sans)' }}>
            {d3.timeFormat('%Y-%m-%d %H:%M')(tooltipData.date)}
          </div>
          <span><strong>Open:</strong> <label style={{ fontFamily: 'var(--font-mono)' }}>${tooltipData.open.toFixed(2)}</label></span>
          <span><strong>High:</strong> <label style={{ fontFamily: 'var(--font-mono)' }}>${tooltipData.high.toFixed(2)}</label></span>
          <span><strong>Low:</strong> <label style={{ fontFamily: 'var(--font-mono)' }}>${tooltipData.low.toFixed(2)}</label></span>
          <span><strong>Close:</strong> <label style={{ fontFamily: 'var(--font-mono)', color: tooltipData.close >= tooltipData.open ? 'var(--trend-up)' : 'var(--trend-down)' }}>${tooltipData.close.toFixed(2)}</label></span>
          <span><strong>Volume:</strong> <label style={{ fontFamily: 'var(--font-mono)' }}>{tooltipData.volume.toLocaleString()}</label></span>
        </div>
      )}
    </div>
  );
}
