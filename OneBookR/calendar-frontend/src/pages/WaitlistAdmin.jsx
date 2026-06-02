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
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newReferrer, setNewReferrer] = useState(''); // valfri värvare
  const [searchTerm, setSearchTerm] = useState('');

const handleAddToWaitlist = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/api/waitlist`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-admin-key': adminKey   // 🔑 lägg till denna!
      },
      body: JSON.stringify({ email: newEmail, name: newName, referrer: newReferrer || null })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Något gick fel.');

    setWaitlist(prev => [
      ...prev,
      { email: newEmail, name: newName, referredBy: newReferrer || null, timestamp: new Date().toISOString() }
    ]);

    setNewEmail('');
    setNewName('');
    setNewReferrer('');
    setError('');
    console.log('Lyckades lägga till:', data);

  } catch (err) {
    console.error('Fel vid addToWaitlist:', err);
    setError(err.message);
  }
};




  console.log("Skickar adminKey:", adminKey); // DEBUG
const handleLogin = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/api/waitlist/admin`, {
      headers: { 'x-admin-key': adminKey } // adminKey måste vara korrekt
    });

    if (res.ok) {
      const data = await res.json();
      setWaitlist(data.waitlist); // detta fyller tabellen
      setIsAuthenticated(true);
      setError('');
    } else {
      setError('Fel admin-nyckel');
    }
  } catch (err) {
    setError('Kunde inte ansluta till servern');
  }
};

// useEffect för att initiera graferna när data laddas
useEffect(() => {
  if (waitlist.length > 0 && isAuthenticated) {
    // Vänta lite för att säkerställa att DOM-elementen finns
    setTimeout(() => {
      initializeCharts(waitlist);
    }, 100);
  }
}, [waitlist, isAuthenticated]);

// useEffect för att uppdatera stapeldiagrammet när period ändras
useEffect(() => {
  if (waitlist.length > 0 && window.Chart && barChart) {
    createBarChart(waitlist);
  }
}, [chartPeriod]);

  
  const initializeCharts = (data) => {
    console.log('Initializing charts with data:', data.length, 'entries');
    
    // Ladda Chart.js dynamiskt
    if (window.Chart) {
      console.log('Chart.js already loaded, creating charts');
      setTimeout(() => {
        createLineChart(data);
        createBarChart(data);
      }, 50);
      return;
    }
    
    console.log('Loading Chart.js...');
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js';
    script.onload = () => {
      console.log('Chart.js loaded, loading date adapter...');
      // Registrera datum-adapter
      const dateScript = document.createElement('script');
      dateScript.src = 'https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3.0.0/dist/chartjs-adapter-date-fns.bundle.min.js';
      dateScript.onload = () => {
        console.log('Date adapter loaded, creating charts');
        setTimeout(() => {
          createLineChart(data);
          createBarChart(data);
        }, 100);
      };
      dateScript.onerror = () => {
        console.error('Failed to load date adapter, creating charts without it');
        setTimeout(() => {
          createLineChart(data);
          createBarChart(data);
        }, 100);
      };
      document.head.appendChild(dateScript);
    };
    script.onerror = () => {
      console.error('Failed to load Chart.js');
    };
    document.head.appendChild(script);
  };

  const createLineChart = (data) => {
    console.log('Creating line chart...');
    const ctx = document.getElementById('lineChart');
    if (!ctx) {
      console.error('Line chart canvas not found');
      return;
    }
    if (!window.Chart) {
      console.error('Chart.js not loaded');
      return;
    }

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
    console.log('Creating bar chart with period:', chartPeriod);
    const ctx = document.getElementById('barChart');
    if (!ctx) {
      console.error('Bar chart canvas not found');
      return;
    }
    if (!window.Chart) {
      console.error('Chart.js not loaded');
      return;
    }

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
        const todayCount = data.filter(entry => {
          const entryDate = new Date(entry.timestamp).toISOString().split('T')[0];
          return entryDate === today;
        }).length;
        return { labels: ['Idag'], values: [todayCount] };
        
      case 'week':
        // Visa måndag till söndag för aktuell vecka
        const startOfWeek = new Date(now);
        const dayOfWeek = startOfWeek.getDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Måndag som första dag
        startOfWeek.setDate(startOfWeek.getDate() + mondayOffset);
        
        const weekData = [];
        const weekLabels = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
        
        for (let i = 0; i < 7; i++) {
          const date = new Date(startOfWeek);
          date.setDate(startOfWeek.getDate() + i);
          const dateStr = date.toISOString().split('T')[0];
          
          const dayCount = data.filter(entry => {
            const entryDate = new Date(entry.timestamp).toISOString().split('T')[0];
            return entryDate === dateStr;
          }).length;
          
          weekData.push(dayCount);
        }
        
        return {
          labels: weekLabels,
          values: weekData
        };
        
      case 'month':
        // Visa veckor för aktuell månad (4-5 veckor)
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        
        // Hitta första måndag i eller före månaden
        const firstMonday = new Date(startOfMonth);
        const firstDayOfWeek = firstMonday.getDay();
        const mondayOffsetMonth = firstDayOfWeek === 0 ? -6 : 1 - firstDayOfWeek;
        firstMonday.setDate(firstMonday.getDate() + mondayOffsetMonth);
        
        const weeklyData = [];
        const weeklyLabels = [];
        let currentWeekStart = new Date(firstMonday);
        let weekNumber = 1;
        
        while (currentWeekStart <= endOfMonth) {
          const weekEnd = new Date(currentWeekStart);
          weekEnd.setDate(currentWeekStart.getDate() + 6);
          
          const weekCount = data.filter(entry => {
            const entryDate = new Date(entry.timestamp);
            return entryDate >= currentWeekStart && entryDate <= weekEnd;
          }).length;
          
          weeklyData.push(weekCount);
          weeklyLabels.push(`V${weekNumber}`);
          
          currentWeekStart.setDate(currentWeekStart.getDate() + 7);
          weekNumber++;
        }
        
        return {
          labels: weeklyLabels,
          values: weeklyData
        };
        
      default: // total
        const totalCount = data.length;
        return {
          labels: ['Totalt'],
          values: [totalCount]
        };
    }
  };

  const handlePeriodChange = (event, newPeriod) => {
    if (newPeriod !== null) {
      setChartPeriod(newPeriod);
      // Omedelbar uppdatering av diagrammet
      if (waitlist.length > 0 && window.Chart) {
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
      'Namn,E-post,Registrerad,Värvad av',
      ...waitlist.map(entry => 
        `"${entry.name}","${entry.email}","${new Date(entry.timestamp).toLocaleString('sv-SE')}","${entry.referredBy || ''}"`
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

  // Filter waitlist based on search term
  const filteredWaitlist = waitlist.filter(entry => 
    entry.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    entry.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (entry.referredBy && entry.referredBy.toLowerCase().includes(searchTerm.toLowerCase()))
  ) || [];

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
        {/* Huvuddiagram - Tillväxt (ännu bredare) */}
        <Grid item xs={12} lg={10}>
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
        
        {/* Sidodiagram - Periodanalys (ännu smalare) */}
        <Grid item xs={12} lg={2}>
          <Paper sx={{ 
            p: 2, 
            borderRadius: 4, 
            boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
            border: '1px solid rgba(99,91,255,0.1)',
            background: 'linear-gradient(135deg, #ffffff 0%, #f8f9ff 100%)'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Box sx={{ 
                width: 3, 
                height: 16, 
                background: 'linear-gradient(135deg, #ff9800 0%, #ffb74d 100%)', 
                borderRadius: 2, 
                mr: 1 
              }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0a2540', fontSize: '0.9rem' }}>
                Period
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
                  fontSize: '0.7rem',
                  py: 0.5,
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
              <ToggleButton value="today" sx={{ width: '100%' }}>Idag</ToggleButton>
              <ToggleButton value="week" sx={{ width: '100%' }}>Vecka</ToggleButton>
              <ToggleButton value="month" sx={{ width: '100%' }}>Månad</ToggleButton>
              <ToggleButton value="total" sx={{ width: '100%' }}>Totalt</ToggleButton>
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
              {filteredWaitlist.length} av {waitlist.length} personer visas
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <TextField
              placeholder="Sök namn, e-post eller värvare..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              size="small"
              sx={{
                minWidth: 300,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 3,
                  bgcolor: 'rgba(255,255,255,0.9)',
                  '& fieldset': {
                    borderColor: 'rgba(255,255,255,0.5)'
                  },
                  '&:hover fieldset': {
                    borderColor: 'rgba(255,255,255,0.8)'
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: 'rgba(255,255,255,1)'
                  }
                },
                '& .MuiInputBase-input': {
                  color: '#0a2540',
                  '&::placeholder': {
                    color: '#666',
                    opacity: 0.8
                  }
                }
              }}
            />
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
                <TableCell sx={{ 
                  fontWeight: 700, 
                  bgcolor: '#f8f9ff',
                  borderBottom: '2px solid #635bff',
                  color: '#0a2540'
                }}>
                  Värvad av
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredWaitlist.map((entry, index) => (
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
                  <TableCell sx={{ color: '#666', fontSize: '0.875rem' }}>
                    {entry.referredBy ? entry.referredBy : "—"}
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