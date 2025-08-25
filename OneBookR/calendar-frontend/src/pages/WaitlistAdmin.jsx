import React, { useState, useEffect } from 'react';
import { 
  Container, Typography, Box, Paper, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, TextField, Button, Alert,
  Grid, Card, CardContent, ToggleButton, ToggleButtonGroup
} from '@mui/material';
import { API_BASE_URL } from '../config';

const WaitlistAdmin = () => {
  const [waitlist, setWaitlist] = useState([]);
  const [adminKey, setAdminKey] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState('');
  const [chartPeriod, setChartPeriod] = useState('total');
  const [lineChart, setLineChart] = useState(null);
  const [barChart, setBarChart] = useState(null);

  const handleLogin = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/waitlist/admin`, {
        headers: { 'x-admin-key': adminKey }
      });
      
      if (res.ok) {
        const data = await res.json();
        setWaitlist(data.waitlist);
        setIsAuthenticated(true);
        setError('');
        initializeCharts(data.waitlist);
      } else {
        setError('Fel admin-nyckel');
      }
    } catch (err) {
      setError('Kunde inte ansluta till servern');
    }
  };

  const initializeCharts = (data) => {
    // Ladda Chart.js dynamiskt
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    script.onload = () => {
      createLineChart(data);
      createBarChart(data);
    };
    document.head.appendChild(script);
  };

  const createLineChart = (data) => {
    const ctx = document.getElementById('lineChart');
    if (!ctx || !window.Chart) return;

    // Gruppera data per dag
    const dailyData = {};
    data.forEach(entry => {
      const date = new Date(entry.timestamp).toISOString().split('T')[0];
      dailyData[date] = (dailyData[date] || 0) + 1;
    });

    // Skapa kumulativ data
    const sortedDates = Object.keys(dailyData).sort();
    let cumulative = 0;
    const chartData = sortedDates.map(date => {
      cumulative += dailyData[date];
      return { x: date, y: cumulative };
    });

    if (lineChart) lineChart.destroy();
    
    const newChart = new window.Chart(ctx, {
      type: 'line',
      data: {
        datasets: [{
          label: 'Totalt antal registrerade',
          data: chartData,
          borderColor: '#635bff',
          backgroundColor: 'rgba(99,91,255,0.1)',
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'day'
            }
          },
          y: {
            beginAtZero: true
          }
        },
        plugins: {
          legend: {
            display: false
          }
        }
      }
    });
    setLineChart(newChart);
  };

  const createBarChart = (data) => {
    const ctx = document.getElementById('barChart');
    if (!ctx || !window.Chart) return;

    const chartData = getBarChartData(data, chartPeriod);
    
    if (barChart) barChart.destroy();
    
    const newChart = new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels: chartData.labels,
        datasets: [{
          label: 'Registreringar',
          data: chartData.values,
          backgroundColor: '#635bff',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true
          }
        },
        plugins: {
          legend: {
            display: false
          }
        }
      }
    });
    setBarChart(newChart);
  };

  const getBarChartData = (data, period) => {
    const now = new Date();
    
    switch (period) {
      case 'today':
        const today = now.toISOString().split('T')[0];
        const todayCount = data.filter(entry => 
          entry.timestamp.startsWith(today)
        ).length;
        return { labels: ['Idag'], values: [todayCount] };
        
      case 'week':
        const weekData = {};
        for (let i = 6; i >= 0; i--) {
          const date = new Date(now);
          date.setDate(date.getDate() - i);
          const dateStr = date.toISOString().split('T')[0];
          weekData[dateStr] = 0;
        }
        data.forEach(entry => {
          const date = entry.timestamp.split('T')[0];
          if (weekData.hasOwnProperty(date)) {
            weekData[date]++;
          }
        });
        return {
          labels: Object.keys(weekData).map(date => 
            new Date(date).toLocaleDateString('sv-SE', { weekday: 'short' })
          ),
          values: Object.values(weekData)
        };
        
      case 'month':
        const monthData = {};
        for (let i = 29; i >= 0; i--) {
          const date = new Date(now);
          date.setDate(date.getDate() - i);
          const dateStr = date.toISOString().split('T')[0];
          monthData[dateStr] = 0;
        }
        data.forEach(entry => {
          const date = entry.timestamp.split('T')[0];
          if (monthData.hasOwnProperty(date)) {
            monthData[date]++;
          }
        });
        return {
          labels: Object.keys(monthData).map((date, index) => 
            index % 5 === 0 ? new Date(date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }) : ''
          ),
          values: Object.values(monthData)
        };
        
      default: // total
        const totalData = {};
        data.forEach(entry => {
          const date = entry.timestamp.split('T')[0];
          totalData[date] = (totalData[date] || 0) + 1;
        });
        const sortedDates = Object.keys(totalData).sort();
        return {
          labels: sortedDates.map(date => 
            new Date(date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
          ),
          values: sortedDates.map(date => totalData[date])
        };
    }
  };

  const handlePeriodChange = (event, newPeriod) => {
    if (newPeriod !== null) {
      setChartPeriod(newPeriod);
      if (waitlist.length > 0) {
        createBarChart(waitlist);
      }
    }
  };

  const getGrowthStats = () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    const todayCount = waitlist.filter(entry => 
      entry.timestamp.startsWith(today)
    ).length;
    
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekCount = waitlist.filter(entry => 
      new Date(entry.timestamp) >= weekAgo
    ).length;
    
    const monthAgo = new Date(now);
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    const monthCount = waitlist.filter(entry => 
      new Date(entry.timestamp) >= monthAgo
    ).length;
    
    const totalCount = waitlist.length;
    
    return {
      today: todayCount,
      week: weekCount,
      month: monthCount,
      total: totalCount,
      weekGrowth: weekCount > 0 ? ((weekCount / Math.max(totalCount - weekCount, 1)) * 100).toFixed(1) : 0,
      monthGrowth: monthCount > 0 ? ((monthCount / Math.max(totalCount - monthCount, 1)) * 100).toFixed(1) : 0
    };
  };

  const exportCSV = () => {
    const csv = [
      'Namn,E-post,Registrerad',
      ...waitlist.map(entry => 
        `"${entry.name}","${entry.email}","${new Date(entry.timestamp).toLocaleString('sv-SE')}"`
      )
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookr-waitlist-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (!isAuthenticated) {
    return (
      <Container maxWidth="sm" sx={{ mt: 10 }}>
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h5" sx={{ mb: 3 }}>
            BookR Admin - Väntelista
          </Typography>
          <TextField
            label="Admin-nyckel"
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
          />
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Button variant="contained" onClick={handleLogin} fullWidth>
            Logga in
          </Button>
        </Paper>
      </Container>
    );
  }

  const stats = getGrowthStats();

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* Header Stats */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h3" sx={{ mb: 3, fontWeight: 700 }}>
          BookR Väntelista Dashboard
        </Typography>
        
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="h3" sx={{ color: '#635bff', fontWeight: 700 }}>
                  {stats.total}
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  Totalt registrerade
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="h4" sx={{ color: '#2e7d32', fontWeight: 600 }}>
                  +{stats.today}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Idag
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="h4" sx={{ color: '#f57c00', fontWeight: 600 }}>
                  +{stats.week}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Senaste veckan
                </Typography>
                <Typography variant="caption" sx={{ color: '#2e7d32' }}>
                  +{stats.weekGrowth}% tillväxt
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="h4" sx={{ color: '#d32f2f', fontWeight: 600 }}>
                  +{stats.month}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Senaste månaden
                </Typography>
                <Typography variant="caption" sx={{ color: '#2e7d32' }}>
                  +{stats.monthGrowth}% tillväxt
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>

      {/* Charts */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Line Chart */}
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Registreringar över tid
            </Typography>
            <Box sx={{ height: 400 }}>
              <canvas id="lineChart"></canvas>
            </Box>
          </Paper>
        </Grid>
        
        {/* Bar Chart */}
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                Registreringar
              </Typography>
            </Box>
            
            <ToggleButtonGroup
              value={chartPeriod}
              exclusive
              onChange={handlePeriodChange}
              size="small"
              sx={{ mb: 2 }}
            >
              <ToggleButton value="today">Idag</ToggleButton>
              <ToggleButton value="week">Vecka</ToggleButton>
              <ToggleButton value="month">Månad</ToggleButton>
              <ToggleButton value="total">Totalt</ToggleButton>
            </ToggleButtonGroup>
            
            <Box sx={{ height: 300 }}>
              <canvas id="barChart"></canvas>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Export and Table */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">
          Alla registrerade ({waitlist.length})
        </Typography>
        <Button variant="contained" onClick={exportCSV}>
          Exportera CSV
        </Button>
      </Box>
      
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell><strong>Namn</strong></TableCell>
              <TableCell><strong>E-post</strong></TableCell>
              <TableCell><strong>Registrerad</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {waitlist.map((entry, index) => (
              <TableRow key={index}>
                <TableCell>{entry.name}</TableCell>
                <TableCell>{entry.email}</TableCell>
                <TableCell>{new Date(entry.timestamp).toLocaleString('sv-SE')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Container>
  );
};

export default WaitlistAdmin;