/**
 * Date formatting utility functions
 * Converts dates to dd/mm/yyyy format for UI display
 */

/**
 * Format date to dd/mm/yyyy format
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date in dd/mm/yyyy format
 */
function formatToDDMMYYYY(date) {
  if (!date) return null;
  
  try {
    const dateObj = new Date(date);
    
    // Check if date is valid
    if (isNaN(dateObj.getTime())) {
      return null;
    }
    
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    
    return `${day}/${month}/${year}`;
  } catch (error) {
    console.error('Error formatting date:', error);
    return null;
  }
}

/**
 * Parse dd/mm/yyyy format back to Date object
 * @param {string} dateString - Date string in dd/mm/yyyy format
 * @returns {Date|null} Date object or null if invalid
 */
function parseFromDDMMYYYY(dateString) {
  if (!dateString || typeof dateString !== 'string') return null;
  
  try {
    const parts = dateString.split('/');
    if (parts.length !== 3) return null;
    
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
    const year = parseInt(parts[2], 10);
    
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    
    const date = new Date(year, month, day);
    
    // Validate the date (handles edge cases like 31/02/2024)
    if (date.getDate() !== day || date.getMonth() !== month || date.getFullYear() !== year) {
      return null;
    }
    
    return date;
  } catch (error) {
    console.error('Error parsing date:', error);
    return null;
  }
}

/**
 * Format date for database storage (ISO format)
 * @param {Date|string} date - Date to format
 * @returns {string|null} ISO date string or null
 */
function formatForDatabase(date) {
  if (!date) return null;
  
  try {
    const dateObj = new Date(date);
    
    if (isNaN(dateObj.getTime())) {
      return null;
    }
    
    return dateObj.toISOString().split('T')[0]; // YYYY-MM-DD format
  } catch (error) {
    console.error('Error formatting date for database:', error);
    return null;
  }
}

/**
 * Format date for API response (dd/mm/yyyy format)
 * @param {Date|string} date - Date to format
 * @returns {string|null} Formatted date string or null
 */
function formatForAPI(date) {
  return formatToDDMMYYYY(date);
}

/**
 * Validate if a date string is in dd/mm/yyyy format
 * @param {string} dateString - Date string to validate
 * @returns {boolean} True if valid format
 */
function isValidDDMMYYYYFormat(dateString) {
  if (!dateString || typeof dateString !== 'string') return false;
  
  const parts = dateString.split('/');
  if (parts.length !== 3) return false;
  
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  
  if (isNaN(day) || isNaN(month) || isNaN(year)) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year < 1900 || year > 2100) return false;
  
  // Check for valid day in month
  const date = new Date(year, month - 1, day);
  return date.getDate() === day && date.getMonth() === month - 1 && date.getFullYear() === year;
}

module.exports = {
  formatToDDMMYYYY,
  parseFromDDMMYYYY,
  formatForDatabase,
  formatForAPI,
  isValidDDMMYYYYFormat
};
