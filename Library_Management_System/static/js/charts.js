/**
 * Athena LMS - Dynamic Canvas Chart Engine (No external heavy dependencies)
 */

const LMSCharts = {
    // 1. Draw Category Distribution Donut Chart
    renderCategoryDonut(canvasId, legendContainerId, categories) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const legendContainer = document.getElementById(legendContainerId);
        
        // Handle high-DPI crisp rendering
        const dpr = window.devicePixelRatio || 1;
        const width = 190;
        const height = 190;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.scale(dpr, dpr);

        ctx.clearRect(0, 0, width, height);

        const validCats = categories.filter(c => (c.book_count || 0) > 0);
        const total = validCats.reduce((acc, c) => acc + (c.book_count || 0), 0);

        if (total === 0) {
            ctx.fillStyle = '#64748b';
            ctx.font = '12px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No catalog data', width / 2, height / 2);
            if (legendContainer) legendContainer.innerHTML = '<p class="text-muted text-center py-2">No categories found</p>';
            return;
        }

        const centerX = width / 2;
        const centerY = height / 2;
        const outerRadius = 80;
        const innerRadius = 52;

        let startAngle = -Math.PI / 2;

        validCats.forEach(cat => {
            const count = cat.book_count || 0;
            const sliceAngle = (count / total) * (Math.PI * 2);
            const endAngle = startAngle + sliceAngle;

            ctx.beginPath();
            ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle);
            ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
            ctx.closePath();

            ctx.fillStyle = cat.color || '#6366f1';
            ctx.fill();

            startAngle = endAngle;
        });

        // Center Total text
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#ffffff';
        ctx.font = 'bold 20px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(total.toString(), centerX, centerY - 6);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px Inter, sans-serif';
        ctx.fillText('TITLES', centerX, centerY + 14);

        // Populate Legend list
        if (legendContainer) {
            legendContainer.innerHTML = validCats.map(cat => {
                const percentage = ((cat.book_count / total) * 100).toFixed(0);
                return `
                    <div class="cat-legend-row">
                        <div class="cat-legend-label">
                            <span class="cat-legend-color" style="background:${cat.color || '#6366f1'}"></span>
                            <span>${cat.name}</span>
                        </div>
                        <span class="cat-legend-value">${cat.book_count} (${percentage}%)</span>
                    </div>
                `;
            }).join('');
        }
    },

    // 2. Draw Monthly Circulation Trends Bar Chart
    renderCirculationTrend(canvasId, trendsData) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const container = canvas.parentElement;
        const dpr = window.devicePixelRatio || 1;
        
        const width = container.clientWidth || 500;
        const height = 230;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.scale(dpr, dpr);

        ctx.clearRect(0, 0, width, height);

        // Fallback default months if no data
        let trends = trendsData && trendsData.length > 0 ? trendsData : [
            { month_label: 'Oct', total_issued: 8, total_returned: 6 },
            { month_label: 'Nov', total_issued: 14, total_returned: 11 },
            { month_label: 'Dec', total_issued: 19, total_returned: 15 },
            { month_label: 'Jan', total_issued: 25, total_returned: 20 },
            { month_label: 'Feb', total_issued: 32, total_returned: 27 },
            { month_label: 'Mar', total_issued: 18, total_returned: 14 }
        ];

        const paddingLeft = 36;
        const paddingBottom = 30;
        const paddingTop = 20;
        const paddingRight = 20;

        const plotWidth = width - paddingLeft - paddingRight;
        const plotHeight = height - paddingTop - paddingBottom;

        const maxVal = Math.max(
            ...trends.map(t => Math.max(Number(t.total_issued) || 0, Number(t.total_returned) || 0)), 
            10
        );

        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        const gridColor = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
        const textColor = isLight ? '#64748b' : '#94a3b8';

        // Draw horizontal grid lines
        const gridSteps = 4;
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        ctx.fillStyle = textColor;
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'right';

        for (let i = 0; i <= gridSteps; i++) {
            const yVal = Math.round((maxVal / gridSteps) * i);
            const y = height - paddingBottom - (plotHeight * (i / gridSteps));

            ctx.beginPath();
            ctx.moveTo(paddingLeft, y);
            ctx.lineTo(width - paddingRight, y);
            ctx.stroke();

            ctx.fillText(yVal.toString(), paddingLeft - 8, y + 3);
        }

        // Draw Grouped Bars
        const groupWidth = plotWidth / trends.length;
        const barWidth = Math.min(18, (groupWidth - 16) / 2);

        trends.forEach((t, index) => {
            const groupX = paddingLeft + (index * groupWidth) + (groupWidth / 2);
            const issuedVal = Number(t.total_issued) || 0;
            const returnedVal = Number(t.total_returned) || 0;

            const issuedH = (issuedVal / maxVal) * plotHeight;
            const returnedH = (returnedVal / maxVal) * plotHeight;

            const x1 = groupX - barWidth - 2;
            const y1 = height - paddingBottom - issuedH;

            const x2 = groupX + 2;
            const y2 = height - paddingBottom - returnedH;

            // Bar 1: Issued (Indigo gradient)
            const grad1 = ctx.createLinearGradient(0, y1, 0, height - paddingBottom);
            grad1.addColorStop(0, '#6366f1');
            grad1.addColorStop(1, '#4338ca');
            ctx.fillStyle = grad1;
            ctx.beginPath();
            ctx.roundRect(x1, y1, barWidth, issuedH, [4, 4, 0, 0]);
            ctx.fill();

            // Bar 2: Returned (Emerald gradient)
            const grad2 = ctx.createLinearGradient(0, y2, 0, height - paddingBottom);
            grad2.addColorStop(0, '#10b981');
            grad2.addColorStop(1, '#059669');
            ctx.fillStyle = grad2;
            ctx.beginPath();
            ctx.roundRect(x2, y2, barWidth, returnedH, [4, 4, 0, 0]);
            ctx.fill();

            // Month Label
            ctx.fillStyle = textColor;
            ctx.font = '11px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(t.month_label || `M${index+1}`, groupX, height - 10);
        });
    }
};

window.LMSCharts = LMSCharts;
