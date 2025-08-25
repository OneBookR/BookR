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

      {/* Kompakta mätinstrument */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {/* Huvudmätare - Total */}
        <Grid item xs={6} md={3}>
          <Card sx={{ 
            borderRadius: 3, 
            background: 'linear-gradient(135deg, #635bff 0%, #7c4dff 100%)',
            color: 'white',
            boxShadow: '0 4px 16px rgba(99,91,255,0.3)',
            border: 'none',
            height: 120
          }}>
            <CardContent sx={{ textAlign: 'center', py: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography variant="h3" sx={{ fontWeight: 700, mb: 0.5, fontSize: '2rem' }}>
                {stats.total}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9, fontWeight: 500, fontSize: '0.8rem' }}>
                Totalt registrerade
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Dagens mätare */}
        <Grid item xs={6} md={3}>
          <Card sx={{ 
            borderRadius: 3, 
            background: 'linear-gradient(135deg, #4caf50 0%, #66bb6a 100%)',
            color: 'white',
            boxShadow: '0 4px 16px rgba(76,175,80,0.3)',
            height: 120
          }}>
            <CardContent sx={{ textAlign: 'center', py: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography variant="h3" sx={{ fontWeight: 700, mb: 0.5, fontSize: '2rem' }}>
                +{stats.today}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9, fontWeight: 500, fontSize: '0.8rem' }}>
                Idag
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Veckans mätare */}
        <Grid item xs={6} md={3}>
          <Card sx={{ 
            borderRadius: 3, 
            background: 'linear-gradient(135deg, #ff9800 0%, #ffb74d 100%)',
            color: 'white',
            boxShadow: '0 4px 16px rgba(255,152,0,0.3)',
            height: 120
          }}>
            <CardContent sx={{ textAlign: 'center', py: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography variant="h3" sx={{ fontWeight: 700, mb: 0.5, fontSize: '2rem' }}>
                +{stats.week}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9, fontWeight: 500, fontSize: '0.8rem' }}>
                Senaste veckan
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8, fontSize: '0.7rem' }}>
                +{stats.weekGrowth}% tillväxt
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Månadens mätare */}
        <Grid item xs={6} md={3}>
          <Card sx={{ 
            borderRadius: 3, 
            background: 'linear-gradient(135deg, #e91e63 0%, #f06292 100%)',
            color: 'white',
            boxShadow: '0 4px 16px rgba(233,30,99,0.3)',
            height: 120
          }}>
            <CardContent sx={{ textAlign: 'center', py: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography variant="h3" sx={{ fontWeight: 700, mb: 0.5, fontSize: '2rem' }}>
                +{stats.month}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9, fontWeight: 500, fontSize: '0.8rem' }}>
                Senaste månaden
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8, fontSize: '0.7rem' }}>
                +{stats.monthGrowth}% tillväxt
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Expanderade diagram */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Huvuddiagram - Tillväxt (bredare) */}
        <Grid item xs={12} lg={9}>
          <Paper sx={{ 
            p: 4, 
            borderRadius: 4, 
            boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
            border: '1px solid rgba(99,91,255,0.1)',
            background: 'linear-gradient(135deg, #ffffff 0%, #f8f9ff 100%)'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <Box sx={{ 
                width: 4, 
                height: 24, 
                background: 'linear-gradient(135deg, #635bff 0%, #7c4dff 100%)', 
                borderRadius: 2, 
                mr: 2 
              }} />
              <Typography variant="h6" sx={{ fontWeight: 700, color: '#0a2540' }}>
                Tillväxt över tid
              </Typography>
            </Box>
            <Box sx={{ height: 400, position: 'relative' }}>
              <canvas id="lineChart"></canvas>
            </Box>
          </Paper>
        </Grid>
        
        {/* Sidodiagram - Periodanalys (smalare) */}
        <Grid item xs={12} lg={3}>
          <Paper sx={{ 
            p: 3, 
            borderRadius: 4, 
            boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
            border: '1px solid rgba(99,91,255,0.1)',
            background: 'linear-gradient(135deg, #ffffff 0%, #f8f9ff 100%)'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Box sx={{ 
                width: 4, 
                height: 20, 
                background: 'linear-gradient(135deg, #ff9800 0%, #ffb74d 100%)', 
                borderRadius: 2, 
                mr: 1.5 
              }} />
              <Typography variant="h6" sx={{ fontWeight: 700, color: '#0a2540', fontSize: '1rem' }}>
                Periodanalys
              </Typography>
            </Box>
            
            <ToggleButtonGroup
              value={chartPeriod}
              exclusive
              onChange={handlePeriodChange}
              size="small"
              orientation="vertical"
              sx={{ 
                mb: 2, 
                width: '100%',
                '& .MuiToggleButton-root': {
                  borderRadius: 2,
                  border: '1px solid rgba(99,91,255,0.2)',
                  mb: 0.5,
                  '&.Mui-selected': {
                    background: 'linear-gradient(135deg, #635bff 0%, #7c4dff 100%)',
                    color: 'white',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #5e35b1 0%, #673ab7 100%)'
                    }
                  }
                }
              }}
            >
              <ToggleButton value="today" sx={{ width: '100%', fontSize: '0.75rem' }}>Idag</ToggleButton>
              <ToggleButton value="week" sx={{ width: '100%', fontSize: '0.75rem' }}>Vecka</ToggleButton>
              <ToggleButton value="month" sx={{ width: '100%', fontSize: '0.75rem' }}>Månad</ToggleButton>
              <ToggleButton value="total" sx={{ width: '100%', fontSize: '0.75rem' }}>Totalt</ToggleButton>
            </ToggleButtonGroup>
            
            <Box sx={{ height: 320, position: 'relative' }}>
              <canvas id="barChart"></canvas>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Stilren datatabell */}
      <Paper sx={{ 
        borderRadius: 4, 
        boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
        border: '1px solid rgba(99,91,255,0.1)',
        overflow: 'hidden'
      }}>
        <Box sx={{ 
          p: 4, 
          background: 'linear-gradient(135deg, #635bff 0%, #7c4dff 100%)',
          color: 'white',
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center' 
        }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
              Registrerade användare
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              {waitlist.length} personer på väntelistan
            </Typography>
          </Box>
          <Button 
            variant="contained" 
            onClick={exportCSV}
            sx={{ 
              background: 'rgba(255,255,255,0.2)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.3)',
              color: 'white',
              fontWeight: 600,
              borderRadius: 3,
              '&:hover': {
                background: 'rgba(255,255,255,0.3)'
              }
            }}
          >
            📈 Exportera CSV
          </Button>
        </Box>
        
        <TableContainer sx={{ maxHeight: 600 }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ 
                  fontWeight: 700, 
                  bgcolor: '#f8f9ff',
                  borderBottom: '2px solid #635bff',
                  color: '#0a2540'
                }}>
                  Namn
                </TableCell>
                <TableCell sx={{ 
                  fontWeight: 700, 
                  bgcolor: '#f8f9ff',
                  borderBottom: '2px solid #635bff',
                  color: '#0a2540'
                }}>
                  E-post
                </TableCell>
                <TableCell sx={{ 
                  fontWeight: 700, 
                  bgcolor: '#f8f9ff',
                  borderBottom: '2px solid #635bff',
                  color: '#0a2540'
                }}>
                  Registrerad
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {waitlist.map((entry, index) => (
                <TableRow 
                  key={index} 
                  sx={{ 
                    '&:hover': { 
                      bgcolor: 'rgba(99,91,255,0.05)',
                      transform: 'scale(1.001)',
                      transition: 'all 0.2s ease'
                    },
                    '&:nth-of-type(even)': {
                      bgcolor: 'rgba(99,91,255,0.02)'
                    }
                  }}
                >
                  <TableCell sx={{ fontWeight: 500, color: '#0a2540' }}>
                    {entry.name}
                  </TableCell>
                  <TableCell sx={{ color: '#666' }}>
                    {entry.email}
                  </TableCell>
                  <TableCell sx={{ color: '#666', fontSize: '0.875rem' }}>
                    {new Date(entry.timestamp).toLocaleString('sv-SE')}
                  </TableCell>
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