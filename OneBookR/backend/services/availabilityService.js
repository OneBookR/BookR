import NodeCache from 'node-cache';
import { getFreeBusy } from '../helpers/calendarHelper.js';

// ✅ DEDICATED CACHE för availability
const availabilityCache = new NodeCache({ 
  stdTTL: 180, // 3 minutes
  maxKeys: 500,
  useClones: false
});

// ✅ BATCH PROCESSING för bättre prestanda
export async function calculateAvailabilitySlots({
  tokens,
  timeMin,
  timeMax,
  duration,
  dayStart = '09:00',
  dayEnd = '17:00',
  isMultiDay = false,
  timezone = 'Europe/Stockholm'
}) {
  try {
    // ✅ INPUT VALIDATION
    if (!Array.isArray(tokens) || tokens.length === 0) {
      throw new Error('No tokens provided');
    }

    if (tokens.length > 50) {
      throw new Error('Too many participants (max 50)');
    }

    const durationMs = duration * 60 * 1000;
    if (durationMs < 15 * 60 * 1000 || durationMs > 8 * 60 * 60 * 1000) {
      throw new Error('Duration must be between 15 minutes and 8 hours');
    }

    // ✅ CACHE KEY för identical requests
    const cacheKey = createCacheKey({
      tokenCount: tokens.length,
      timeMin,
      timeMax,
      duration,
      dayStart,
      dayEnd,
      isMultiDay
    });

    const cached = availabilityCache.get(cacheKey);
    if (cached) {
      console.log('[Availability] Cache hit');
      return cached;
    }

    // ✅ PARALLEL PROCESSING med concurrency limit
    const busyPromises = tokens.map(async (token, index) => {
      try {
        // Stagger requests to avoid rate limiting
        if (index > 0) {
          await new Promise(resolve => setTimeout(resolve, index * 100));
        }
        
        // ✅ DETEKTERA PROVIDER
        let provider = 'google';
        try {
          const testGoogle = await fetch('https://www.googleapis.com/oauth2/v2/userinfo?fields=email', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          provider = testGoogle.ok ? 'google' : 'microsoft';
        } catch {
          provider = 'microsoft';
        }
        
        const result = await getFreeBusy(token, timeMin, timeMax, provider);
        return { success: true, data: result, token, provider };
      } catch (error) {
        console.error(`[Availability] Failed to get free/busy for token ${index}:`, error);
        return { success: false, error, token };
      }
    });
    
    const busyResults = await Promise.allSettled(busyPromises);
    
    // ✅ COLLECT OCH PROCESS BUSY TIMES
    const allBusyTimes = [];
    let successfulTokens = 0;
    
    busyResults.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.success) {
        successfulTokens++;
        const calendars = result.value.data.calendars || {};
        const provider = result.value.provider;
        
        Object.values(calendars).forEach(calendar => {
          if (calendar.busy && Array.isArray(calendar.busy)) {
            // ✅ DEBUG: Log busy times per provider
            if (calendar.busy.length > 0) {
              console.log(`[Availability] ${provider.toUpperCase()} busy times (token ${index}):`, 
                calendar.busy.slice(0, 2).map(b => `${b.start} - ${b.end}`)
              );
            }
            
            allBusyTimes.push(...calendar.busy.map(busy => ({
              ...busy,
              tokenIndex: index,
              provider
            })));
          }
        });
      }
    });

    console.log(`[Availability] Successfully processed ${successfulTokens}/${tokens.length} calendars`);

    if (successfulTokens === 0) {
      throw new Error('No calendars could be accessed');
    }

    // ✅ OPTIMIZED SLOT GENERATION
    const slots = isMultiDay 
      ? generateMultiDaySlots({ timeMin, timeMax, duration, dayStart, dayEnd, allBusyTimes })
      : generateSingleDaySlots({ timeMin, timeMax, duration, dayStart, dayEnd, allBusyTimes });

    // ✅ SORT OCH LIMIT RESULTS
    const sortedSlots = slots
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, 100); // Max 100 slots för performance

    // ✅ ADD METADATA
    const result = {
      slots: sortedSlots,
      metadata: {
        participantCount: tokens.length,
        successfulCalendars: successfulTokens,
        totalBusyEvents: allBusyTimes.length,
        generatedAt: new Date().toISOString(),
        timeRange: { timeMin, timeMax },
        workingHours: { dayStart, dayEnd }
      }
    };

    // ✅ CACHE RESULT
    availabilityCache.set(cacheKey, result);
    
    return result;
    
  } catch (error) {
    console.error('[Availability] Calculation failed:', error);
    throw error;
  }
}

// ✅ OPTIMERAD SINGLE DAY SLOT GENERATION
function generateSingleDaySlots({ timeMin, timeMax, duration, dayStart, dayEnd, allBusyTimes }) {
  const slots = [];
  const startTime = new Date(timeMin);
  const endTime = new Date(timeMax);
  const durationMs = duration * 60 * 1000;
  
  // ✅ PRE-PROCESS BUSY TIMES för snabbare lookup
  const busyIntervals = allBusyTimes.map(busy => ({
    start: new Date(busy.start).getTime(),
    end: new Date(busy.end).getTime(),
    provider: busy.provider
  })).sort((a, b) => a.start - b.start);

  // ✅ GENERATE SLOTS med 15-minuters intervaller
  const currentDate = new Date(startTime);
  
  while (currentDate < endTime) {
    const dayOfWeek = currentDate.getDay();
    
    // Skip weekends (optional - can be configurable)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(0, 0, 0, 0);
      continue;
    }

    // ✅ SET WORKING HOURS för current day
    const dayStartTime = setTimeOnDate(currentDate, dayStart);
    const dayEndTime = setTimeOnDate(currentDate, dayEnd);
    
    // Generate slots inom working hours med 15-min intervaller
    for (let slotStart = new Date(dayStartTime); 
         slotStart.getTime() + durationMs <= dayEndTime.getTime(); 
         slotStart.setMinutes(slotStart.getMinutes() + 15)) {
      
      const slotEnd = new Date(slotStart.getTime() + durationMs);
      
      // ✅ FAST CONFLICT CHECK
      const conflicts = getConflicts(slotStart.getTime(), slotEnd.getTime(), busyIntervals);
      if (conflicts.length === 0) {
        slots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          duration,
          date: slotStart.toISOString().split('T')[0],
          dayOfWeek: slotStart.getDay()
        });
      }
    }
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
    currentDate.setHours(0, 0, 0, 0);
  }
  
  return slots;
}

// ✅ MULTI-DAY SLOT GENERATION
function generateMultiDaySlots({ timeMin, timeMax, duration, dayStart, dayEnd, allBusyTimes }) {
  const slots = [];
  const startDate = new Date(timeMin);
  const endDate = new Date(timeMax);
  
  // För multi-day meetings, hitta consecutive lediga dagar
  const requiredDays = Math.ceil(duration / 8); // Assuming 8 hours per day
  
  for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
    const consecutiveDays = checkConsecutiveFreeDays(date, requiredDays, dayStart, dayEnd, allBusyTimes);
    
    if (consecutiveDays.allFree) {
      slots.push({
        start: consecutiveDays.start,
        end: consecutiveDays.end,
        duration: requiredDays * 8 * 60, // Total minutes
        isMultiDay: true,
        days: requiredDays,
        hoursPerDay: Math.min(duration / requiredDays, 8)
      });
    }
  }
  
  return slots;
}

// ✅ HELPER FUNCTIONS
function createCacheKey(params) {
  return `avail_${JSON.stringify(params)}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function setTimeOnDate(date, timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const newDate = new Date(date);
  newDate.setHours(hours, minutes, 0, 0);
  return newDate;
}

function getConflicts(slotStart, slotEnd, busyIntervals) {
  return busyIntervals.filter(busy => 
    slotStart < busy.end && slotEnd > busy.start
  );
}

function checkConsecutiveFreeDays(startDate, requiredDays, dayStart, dayEnd, allBusyTimes) {
  // Implementation för multi-day availability check
  // Returnerar { allFree: boolean, start: string, end: string }
  
  const start = setTimeOnDate(startDate, dayStart);
  const end = new Date(startDate);
  end.setDate(end.getDate() + requiredDays - 1);
  setTimeOnDate(end, dayEnd);
  
  const hasAnyConflict = allBusyTimes.some(busy => {
    const busyStart = new Date(busy.start).getTime();
    const busyEnd = new Date(busy.end).getTime();
    return busyStart < end.getTime() && busyEnd > start.getTime();
  });
  
  return {
    allFree: !hasAnyConflict,
    start: start.toISOString(),
    end: end.toISOString()
  };
}

// ✅ CACHE MANAGEMENT
export function clearAvailabilityCache() {
  availabilityCache.flushAll();
}

export function getAvailabilityCacheStats() {
  return availabilityCache.getStats();
}
