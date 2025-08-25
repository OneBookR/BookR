import React, { useState, useEffect } from 'react';
import { 
  Container, Typography, Box, Paper, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, TextField, Button, Alert,
  Grid, Card, CardContent, ToggleButton, ToggleButtonGroup, List, ListItem
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
        setTimeout(() => initializeCharts(data.waitlist), 100);
      } else {
        setError('Fel admin-nyckel');
      }
    } catch (err) {
      setError('Kunde inte ansluta till servern');
    }
  };

  const initializeCharts = (data) => {
    // Ladda Chart.js dynamiskt
    if (window.Chart) {
      createLineChart(data);
      createBarChart(data);
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js';
    script.onload = () => {
      // Registrera datum-adapter
      const dateScript = document.createElement('script');
      dateScript.src = 'https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3.0.0/dist/chartjs-adapter-date-fns.bundle.min.js';
      dateScript.onload = () => {
        createLineChart(data);
        createBarChart(data);
      };
      document.head.appendChild(dateScript);
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
          tension: 0.4,
          pointBackgroundColor: '#635bff',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'day',
              displayFormats: {
                day: 'MMM dd'
              }
            },
            grid: {
              display: false
            }
          },
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(0,0,0,0.1)'
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: 'rgba(0,0,0,0.8)',
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: '#635bff',
            borderWidth: 1
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
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(0,0,0,0.1)'
            }
          },
          x: {
            grid: {
              display: false
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: 'rgba(0,0,0,0.8)',
            titleColor: '#fff',
            bodyColor: '#fff'
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
        setTimeout(() => createBarChart(waitlist), 100);
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
        <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 3 }}>
          <Typography variant="h4" sx={{ mb: 3, fontWeight: 700, color: '#635bff' }}>
            BookR Admin
          </Typography>
          <Typography variant="body1" sx={{ mb: 3, color: '#666' }}>
            Väntelista Dashboard
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
          <Button 
            variant="contained" 
            onClick={handleLogin} 
            fullWidth
            sx={{ 
              py: 1.5,
              background: 'linear-gradient(90deg, #635bff 0%, #6c47ff 100%)',
              fontWeight: 600
            }}
          >
            Logga in
          </Button>
        </Paper>
      </Container>
    );
  }

  const stats = getGrowthStats();

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h3" sx={{ mb: 1, fontWeight: 700, color: '#0a2540' }}>
          BookR Dashboard
        </Typography>
        <Typography variant="body1" sx={{ color: '#666' }}>
          Väntelista-analys och statistik
        </Typography>
      </Box>

      {/* Stats Section */}
      <Grid container spacing={4} sx={{ mb: 4 }}>
        {/* Total Count */}
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(99,91,255,0.1)' }}>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="h2" sx={{ color: '#635bff', fontWeight: 700, mb: 1 }}>
                {stats.total}
              </Typography>
              <Typography variant="h6" sx={{ color: '#666', fontWeight: 500 }}>
                Totalt registrerade
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Stats List */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
            <Typography variant="h6" sx={{ mb: 3, fontWeight: 600, color: '#0a2540' }}>
              Registreringar
            </Typography>
            
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                py: 2, 
                px: 3, 
                bgcolor: '#f8f9ff', 
                borderRadius: 2,
                border: '1px solid #e3e8ff'
              }}>
                <Typography variant="body1" sx={{ fontWeight: 600, color: '#0a2540' }}>
                  Idag
                </Typography>
                <Typography variant="h5" sx={{ color: '#2e7d32', fontWeight: 700 }}>
                  +{stats.today}
                </Typography>
              </Box>
              
              <Box sx={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                py: 2, 
                px: 3, 
                bgcolor: '#f8f9ff', 
                borderRadius: 2,
                border: '1px solid #e3e8ff'
              }}>
                <Box>
                  <Typography variant="body1" sx={{ fontWeight: 600, color: '#0a2540' }}>
                    Senaste veckan
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#2e7d32', fontWeight: 500 }}>
                    +{stats.weekGrowth}% tillväxt
                  </Typography>
                </Box>
                <Typography variant="h5" sx={{ color: '#f57c00', fontWeight: 700 }}>
                  +{stats.week}
                </Typography>
              </Box>
              
              <Box sx={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                py: 2, 
                px: 3, 
                bgcolor: '#f8f9ff', 
                borderRadius: 2,
                border: '1px solid #e3e8ff'
              }}>
                <Box>
                  <Typography variant="body1" sx={{ fontWeight: 600, color: '#0a2540' }}>
                    Senaste månaden
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#2e7d32', fontWeight: 500 }}>
                    +{stats.monthGrowth}% tillväxt
                  </Typography>
                </Box>
                <Typography variant="h5" sx={{ color: '#d32f2f', fontWeight: 700 }}>
                  +{stats.month}
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Charts */}
      <Grid container spacing={4} sx={{ mb: 4 }}>
        {/* Line Chart */}
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 3, borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
            <Typography variant="h6" sx={{ mb: 3, fontWeight: 600, color: '#0a2540' }}>
              Tillväxt över tid
            </Typography>
            <Box sx={{ height: 400, position: 'relative' }}>
              <canvas id="lineChart"></canvas>
            </Box>
          </Paper>
        </Grid>
        
        {/* Bar Chart */}
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 3, borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: '#0a2540' }}>
              Registreringar per period
            </Typography>
            
            <ToggleButtonGroup
              value={chartPeriod}
              exclusive
              onChange={handlePeriodChange}
              size="small"
              sx={{ mb: 3, width: '100%' }}
            >
              <ToggleButton value="today" sx={{ flex: 1 }}>Idag</ToggleButton>
              <ToggleButton value="week" sx={{ flex: 1 }}>Vecka</ToggleButton>
              <ToggleButton value="month" sx={{ flex: 1 }}>Månad</ToggleButton>
              <ToggleButton value="total" sx={{ flex: 1 }}>Totalt</ToggleButton>
            </ToggleButtonGroup>
            
            <Box sx={{ height: 300, position: 'relative' }}>
              <canvas id="barChart"></canvas>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Table */}
      <Paper sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
        <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#0a2540' }}>
            Alla registrerade ({waitlist.length})
          </Typography>
          <Button 
            variant="contained" 
            onClick={exportCSV}
            sx={{ 
              background: 'linear-gradient(90deg, #635bff 0%, #6c47ff 100%)',
              fontWeight: 600
            }}
          >
            Exportera CSV
          </Button>
        </Box>
        
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8f9ff' }}>
                <TableCell sx={{ fontWeight: 600 }}>Namn</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>E-post</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Registrerad</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {waitlist.map((entry, index) => (
                <TableRow key={index} sx={{ '&:hover': { bgcolor: '#f8f9ff' } }}>
                  <TableCell>{entry.name}</TableCell>
                  <TableCell>{entry.email}</TableCell>
                  <TableCell>{new Date(entry.timestamp).toLocaleString('sv-SE')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Container>
  );
};

export default WaitlistAdmin;