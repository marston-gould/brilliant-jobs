// shared/utilities/ai-response-utils.js - Reusable AI response processing utilities

export class AIResponseUtils {
  /**
   * Clean AI response by removing placeholders, brackets, and unwanted content
   */
  static cleanAIResponse(response) {
    if (!response || typeof response !== 'string') {
      return response;
    }

    let cleaned = response.trim();

    // Remove common AI placeholders and brackets
    const placeholderPatterns = [
      // Remove bracketed placeholders like [Your Name], [Company Name], etc.
      /\[[^\]]*\]/g,
      // Remove parenthetical placeholders like (Your Name), (Company)
      /\([^)]*your[^)]*\)/gi,
      // Remove placeholder text patterns
      /\{[^}]*\}/g,
      // Remove common placeholder phrases
      /\b(insert|add|fill in|replace with|customize|personalize)\b[^.!?]*[.!?]/gi,
      // Remove instructions to the user
      /please (customize|personalize|replace|fill|add)[^.!?]*[.!?]/gi,
      // Remove template instructions
      /(note:|remember to|make sure to)[^.!?]*[.!?]/gi,
    ];

    // Apply all placeholder removal patterns
    placeholderPatterns.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });

    // Clean up extra whitespace and line breaks
    cleaned = cleaned
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Replace triple+ line breaks with double
      .replace(/[ \t]+/g, ' ') // Replace multiple spaces/tabs with single space
      .replace(/\n /g, '\n') // Remove spaces at start of lines
      .trim();

    // Remove common incomplete sentences or fragments
    const incompletePatterns = [
      /^(dear|sincerely|best regards|thank you),?\s*$/gim,
      /^\s*(yours truly|yours faithfully|kind regards),?\s*$/gim,
      /^\s*\[.*?\]\s*$/gm, // Lines that are just brackets
      /^\s*\{.*?\}\s*$/gm, // Lines that are just curly braces
    ];

    incompletePatterns.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });

    // Final cleanup
    cleaned = cleaned
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Clean up line breaks again
      .trim();

    return cleaned;
  }

  /**
   * Check if a field is a salary/compensation field
   */
  static isSalaryField(label) {
    if (!label) return false;

    // Exclude EEO/diversity boilerplate that may contain "compensation" in
    // non-salary context (e.g. "...privileges of employment, including compensation...")
    const eeoIndicators = [
      /discriminat/i, /ethnicity/i, /protected\s+group/i,
      /equal\s+employment/i, /\beeo\b/i, /affirmative\s+action/i,
      /veteran/i, /military/i, /vevraa/i, /armed\s+forces/i,
      /disability\s+status/i,
    ];
    if (eeoIndicators.some((pattern) => pattern.test(label))) {
      return false;
    }

    const salaryPatterns = [
      /salary/i, /compensation/i, /pay.*range/i, /pay.*expectation/i,
      /desired.*pay/i, /wage/i, /rate.*hour/i, /hourly.*rate/i, /annual.*income/i,
      /ctc/i, /cost.*to.*company/i, /remuneration/i,
      /financial.*expectation/i, /monetary.*expectation/i,
    ];
    return salaryPatterns.some((pattern) => pattern.test(label));
  }

  /**
   * Check if a field is a cover letter field
   */
  static isCoverLetterField(field) {
    if (!field.label) return false;

    const labelLower = field.label.toLowerCase();

    return (
      labelLower.includes('cover letter') ||
      labelLower.includes('why are you') ||
      labelLower.includes('tell us why') ||
      labelLower.includes('why do you want') ||
      labelLower.includes('motivation') ||
      labelLower.includes('why should we') ||
      labelLower.includes('personal statement') ||
      (labelLower.includes('why') && labelLower.includes('interest')) ||
      (labelLower.includes('describe') && labelLower.includes('yourself')) ||
      (labelLower.includes('tell us about') && labelLower.includes('yourself'))
    );
  }

  /**
   * Generate cover letter using AI service
   */
  static async generateCoverLetter(aiService, userData, jobData, jobDescription) {
    try {
      const fullName = userData.fullName || userData.name ||
        [userData.firstName, userData.lastName].filter(Boolean).join(' ') || "Job Applicant";
      const jobTitle = jobData.title || "Position";
      const company = jobData.company || "Company";
      const skills = userData.skills || "relevant skills and experience";
      const location = userData.location || userData.currentCity || jobData.location || "Remote";
      const jobDescriptionString = AIResponseUtils.getJobDescriptionString(jobDescription, jobData);

      const coverLetterPrompt = `Write a professional cover letter for a job application. Here are the details:

Applicant Name: ${fullName}
Job Title: ${jobTitle}
Company: ${company}
Location: ${location}
Skills: ${skills}
Job Description: ${jobDescriptionString}

Requirements:
- Write a complete, professional cover letter
- Include proper salutation, body paragraphs, and closing
- Highlight relevant skills and experience
- Show enthusiasm for the role and company
- Keep it concise but impactful (200-300 words)
- Do NOT use placeholders, brackets, or incomplete sections
- Make it ready to submit as-is

Please write only the cover letter content without any additional formatting or explanations.`;

      const response = await aiService.getLongformAnswer(
        coverLetterPrompt,
        [], // no options
        {
          fieldType: "textarea",
          fieldContext: "Generate a complete cover letter ready for submission",
          // Let AIService use its own platform (e.g. "workable", "greenhouse")
          userData,
          jobDescription: jobDescriptionString
        }
      );

      if (response && response.trim()) {
        return AIResponseUtils.cleanAIResponse(response);
      } else {
        throw new Error('Empty response from AI service');
      }
    } catch (error) {
      console.error('Error generating cover letter:', error);
      // Return null to fall back to regular AI answer processing
      return null;
    }
  }

  /**
   * Extract job description as a string
   */
  static getJobDescriptionString(jobDescription, jobData = {}) {
    // Try jobDescription first if it's a string
    if (typeof jobDescription === 'string' && jobDescription.trim()) {
      return jobDescription.trim();
    }
    
    // Try jobData.description
    if (typeof jobData.description === 'string' && jobData.description.trim()) {
      return jobData.description.trim();
    }
    
    // If jobDescription is an object, try to extract meaningful text
    if (jobDescription && typeof jobDescription === 'object') {
      // Try common object properties for job descriptions
      const possibleDescriptions = [
        jobDescription.description,
        jobDescription.fullDescription,
        jobDescription.content,
        jobDescription.text,
        jobDescription.summary
      ];
      
      for (const desc of possibleDescriptions) {
        if (typeof desc === 'string' && desc.trim()) {
          return desc.trim();
        }
      }
      
      // If object has title and other properties, combine them
      const parts = [];
      if (jobDescription.title) parts.push(`Title: ${jobDescription.title}`);
      if (jobDescription.company) parts.push(`Company: ${jobDescription.company}`);
      if (jobDescription.location) parts.push(`Location: ${jobDescription.location}`);
      if (jobDescription.department) parts.push(`Department: ${jobDescription.department}`);
      
      if (parts.length > 0) {
        return parts.join('\n');
      }
    }
    
    // Final fallback
    return "Professional position with exciting opportunities for growth and impact.";
  }

  /**
   * Extract job title from the page
   */
  static extractJobTitle(platform = '') {
    try {
      let titleSelectors = [];
      
      if (platform === 'workable') {
        titleSelectors = [
          'h1[data-ui="job-title"]',
          '.job-title',
          'h1.job-header__title',
          'h1',
          '[data-testid="job-title"]',
          '.posting-headline',
          '.job-posting-title'
        ];
      } else if (platform === 'lever') {
        titleSelectors = [
          '.posting-header h2',
          '.section h2',
          'h1',
          'h2',
          '.job-title',
          '.posting-title'
        ];
      } else {
        // Generic selectors
        titleSelectors = [
          'h1',
          'h2',
          '.job-title',
          '.posting-title',
          '.job-header',
          '[data-testid*="title"]'
        ];
      }

      for (const selector of titleSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          return element.textContent.trim();
        }
      }

      // Fallback: extract from document title
      const docTitle = document.title;
      if (docTitle && !docTitle.toLowerCase().includes(platform)) {
        return docTitle.split(' - ')[0] || docTitle.split(' | ')[0] || docTitle;
      }

      return 'Position';
    } catch (error) {
      console.error('Error extracting job title:', error);
      return 'Position';
    }
  }

  /**
   * Extract company name from the page
   */
  static extractCompanyName(platform = '') {
    try {
      let companySelectors = [];
      
      if (platform === 'workable') {
        companySelectors = [
          '[data-ui="company-name"]',
          '.company-name',
          '.job-header__company',
          '[data-testid="company-name"]',
          '.company-title',
          '.employer-name'
        ];
      } else if (platform === 'lever') {
        companySelectors = [
          '.posting-header .company',
          '.company-name',
          '.posting-company',
          '.job-company'
        ];
      } else {
        // Generic selectors
        companySelectors = [
          '.company-name',
          '.company',
          '.employer-name',
          '[data-testid*="company"]'
        ];
      }

      for (const selector of companySelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          return element.textContent.trim();
        }
      }

      // Platform-specific URL extraction
      if (platform === 'workable') {
        const hostname = window.location.hostname;
        if (hostname.includes('.workable.com')) {
          const subdomain = hostname.split('.')[0];
          if (subdomain !== 'www' && subdomain !== 'apply') {
            return subdomain.charAt(0).toUpperCase() + subdomain.slice(1);
          }
        }
      } else if (platform === 'lever') {
        const matches = window.location.href.match(/https:\/\/jobs\.(eu\.)?lever\.co\/([^\/]+)/);
        if (matches && matches[2]) {
          return matches[2].charAt(0).toUpperCase() + matches[2].slice(1);
        }
      }

      // Fallback: extract from document title
      const docTitle = document.title;
      if (docTitle && docTitle.includes(' - ')) {
        const parts = docTitle.split(' - ');
        if (parts.length > 1) {
          return parts[parts.length - 1];
        }
      }

      return 'Company';
    } catch (error) {
      console.error('Error extracting company name:', error);
      return 'Company';
    }
  }
}

export default AIResponseUtils;