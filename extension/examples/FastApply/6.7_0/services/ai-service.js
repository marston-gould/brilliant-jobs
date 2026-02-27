// services/ai-service.js
export default class AIService {
  constructor(config) {
    this.apiHost = config.aiApiHost || config.apiHost;
    this.answerCache = new Map();
    this.platform = config.platform || "generic";
  }

  /**
   * Get AI answer for normal/simple questions (names, emails, phone numbers, short text)
   */
  async getNormalAnswer(question, options = [], context = {}) {
    const normalizedQuestion = question.toLowerCase().trim();

    // Build cache key
    const cacheKey = this.buildCacheKey(normalizedQuestion, options, context);

    if (this.answerCache.has(cacheKey)) {
      return this.answerCache.get(cacheKey);
    }

    try {
      // Build enhanced context for normal questions
      // IMPORTANT: ...context must come FIRST so explicit params always take precedence
      const enhancedContext = this.buildEnhancedContext({
        ...context,
        question,
        options,
        answerType: "normal",
        fieldType: context.fieldType || this.inferNormalFieldType(question),
      });

      const response = await fetch(
        `${this.apiHost}/api/ai-answer/normal-questions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(enhancedContext),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Normal questions AI service returned ${response.status}`
        );
      }

      const responseText = await response.text();

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error(
          "❌ Failed to parse AI service response as JSON:",
          responseText.substring(0, 200)
        );
        throw new Error(
          `Invalid JSON response from AI service. Got: ${responseText.substring(
            0,
            100
          )}...`
        );
      }

      let answer = data.answer;

      // Post-process answer based on field type
      answer = this.postProcessAnswer(answer, enhancedContext.fieldType);

      // Cache the processed answer
      this.answerCache.set(cacheKey, answer);
      return answer;
    } catch (error) {
      console.error("Normal Answer Error:", error);
      return null;
    }
  }

  /**
   * Get AI answer for salary/compensation questions
   * Uses dedicated salary endpoint and extracts numeric value
   */
  async getSalaryAnswer(question, options = [], context = {}) {
    const normalizedQuestion = question.toLowerCase().trim();

    // Build cache key
    const cacheKey = this.buildCacheKey(normalizedQuestion + "_salary", options, context);

    if (this.answerCache.has(cacheKey)) {
      return this.answerCache.get(cacheKey);
    }

    try {
      const enhancedContext = this.buildEnhancedContext({
        ...context,
        question,
        options,
        answerType: "salary",
        fieldType: context.fieldType || "salary",
      });

      const response = await fetch(
        `${this.apiHost}/api/ai-answer/salary-questions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(enhancedContext),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Salary questions AI service returned ${response.status}`
        );
      }

      const data = await response.json();
      let answer = data.answer;

      // Cache the processed answer
      if (answer) {
        this.answerCache.set(cacheKey, answer);
      }
      return answer;
    } catch (error) {
      console.error("Salary Answer Error:", error);
      return null;
    }
  }

  /**
   * Get AI answer for option-based questions (dropdowns, radio buttons, checkboxes)
   */
  async getOptionAnswer(question, options = [], context = {}) {
    // Validate that options are provided
    if (!options || options.length === 0) {
      console.warn("getOptionAnswer called without options");
      return null;
    }

    const normalizedQuestion = question.toLowerCase().trim();

    // Build cache key
    const cacheKey = this.buildCacheKey(normalizedQuestion, options, context);

    if (this.answerCache.has(cacheKey)) {
      return this.answerCache.get(cacheKey);
    }

    try {
      // Build enhanced context for option questions
      // IMPORTANT: ...context must come FIRST so explicit question/options always take precedence
      const enhancedContext = this.buildEnhancedContext({
        ...context,
        question,
        options,
        answerType: "option",
        fieldType: context.fieldType || "select",
      });

      const response = await fetch(
        `${this.apiHost}/api/ai-answer/option-questions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(enhancedContext),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Option questions AI service returned ${response.status}`
        );
      }

      const data = await response.json();
      let answer = data.answer;

      // Post-process answer based on field type
      answer = this.postProcessAnswer(answer, enhancedContext.fieldType);

      // Cache the processed answer
      this.answerCache.set(cacheKey, answer);
      return answer;
    } catch (error) {
      console.error("Option Answer Error:", error);
      return null;
    }
  }

  /**
   * Get AI answer for multi-select questions (checkboxes where multiple can be selected)
   * Returns an array of selected option texts
   */
  async getMultiSelectAnswer(question, options = [], context = {}) {
    // Validate that options are provided
    if (!options || options.length === 0) {
      console.warn("getMultiSelectAnswer called without options");
      return [];
    }

    const normalizedQuestion = question.toLowerCase().trim();

    // Build cache key
    const cacheKey = this.buildCacheKey(
      normalizedQuestion + "_multi",
      options,
      context
    );

    if (this.answerCache.has(cacheKey)) {
      return this.answerCache.get(cacheKey);
    }

    try {
      // Build enhanced context for multi-select questions
      const enhancedContext = this.buildEnhancedContext({
        ...context,
        question,
        options,
        answerType: "multiselect",
        fieldType: context.fieldType || "checkbox-group",
        instructions:
          "Return a comma-separated list of all options that apply based on the user profile and job requirements. Select at least one option.",
      });

      // Use option-questions endpoint with multi-select instruction
      const response = await fetch(
        `${this.apiHost}/api/ai-answer/multiselect-questions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(enhancedContext),
        }
      );

      if (!response.ok) {
        throw new Error(`Multi-select AI service returned ${response.status}`);
      }

      const data = await response.json();
      let answer = data.answer;

      // Parse the answer into an array
      let selectedOptions = [];
      if (Array.isArray(answer)) {
        selectedOptions = answer.map((opt) => String(opt).trim().toLowerCase());
      } else if (typeof answer === "string") {
        // Split comma-separated response and normalize
        selectedOptions = answer
          .split(",")
          .map((opt) => opt.trim().toLowerCase());
      }

      // Ensure at least one option is selected for required fields
      if (selectedOptions.length === 0 && context.required) {
        // Fallback: select first option
        selectedOptions = [options[0].toLowerCase()];
      }

      // Cache the processed answer
      this.answerCache.set(cacheKey, selectedOptions);
      return selectedOptions;
    } catch (error) {
      console.error("Multi-select Answer Error:", error);
      // Fallback: return first option if required
      if (context.required && options.length > 0) {
        return [options[0].toLowerCase()];
      }
      return [];
    }
  }

  /**
   * Get AI answer for longform questions (cover letters, essays, descriptions)
   */
  async getLongformAnswer(question, options = [], context = {}) {
    const normalizedQuestion = question.toLowerCase().trim();

    // Build cache key
    const cacheKey = this.buildCacheKey(normalizedQuestion, options, context);

    if (this.answerCache.has(cacheKey)) {
      return this.answerCache.get(cacheKey);
    }

    try {
      // Build enhanced context for longform questions
      const enhancedContext = this.buildEnhancedContext({
        ...context,
        question,
        options,
        answerType: "longform",
        fieldType: context.fieldType || "textarea",
      });

      const response = await fetch(
        `${this.apiHost}/api/ai-answer/longform-questions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(enhancedContext),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Longform questions AI service returned ${response.status}`
        );
      }

      const data = await response.json();
      let answer = data.answer;

      // Post-process answer based on field type
      answer = this.postProcessAnswer(answer, enhancedContext.fieldType);

      // Cache the processed answer
      this.answerCache.set(cacheKey, answer);
      return answer;
    } catch (error) {
      console.error("Longform Answer Error:", error);
      return null;
    }
  }

  /**
   * Backward compatibility method for existing code
   * @deprecated Use getNormalAnswer, getOptionAnswer, or getLongformAnswer instead
   */
  async getAIAnswer(
    question,
    options = [],
    fieldType = "text",
    fieldContext = ""
  ) {
    console.warn(
      "getAIAnswer is deprecated. Use getNormalAnswer, getOptionAnswer, or getLongformAnswer instead."
    );

    const context = {
      fieldType,
      fieldContext,
    };

    // Auto-route to appropriate specialized method
    if (options && options.length > 0) {
      return await this.getOptionAnswer(question, options, context);
    } else if (fieldType === "salary") {
      return await this.getSalaryAnswer(question, options, context);
    } else if (
      fieldType === "textarea" ||
      fieldContext.includes("cover letter")
    ) {
      return await this.getLongformAnswer(question, options, context);
    } else {
      return await this.getNormalAnswer(question, options, context);
    }
  }

  /**
   * Infer field type for normal questions based on question content
   */
  inferNormalFieldType(question) {
    const questionLower = question.toLowerCase();

    if (questionLower.includes("email")) return "email";
    if (questionLower.includes("phone") || questionLower.includes("mobile"))
      return "phone";
    if (
      questionLower.includes("salary") ||
      questionLower.includes("compensation")
    )
      return "salary";
    if (questionLower.includes("date") || questionLower.includes("when"))
      return "date";
    if (questionLower.includes("location") || questionLower.includes("address"))
      return "location";
    if (questionLower.includes("name")) return "name";
    if (questionLower.includes("number") || questionLower.includes("years"))
      return "number";

    return "text"; // default
  }

  /**
   * Build enhanced context with field analysis
   */
  buildEnhancedContext({
    question,
    options = [],
    platform = this.platform,
    userData = {},
    jobDescription = "",
    jobTitle = "",
    fieldType = null,
    fieldContext = "",
    required = false,
    answerType = null,
  }) {
    return {
      question,
      originalQuestion: question,
      options,
      platform,
      userData,
      description: jobDescription, // Keep 'description' for backward compatibility
      jobDescription,
      jobTitle,
      fieldType,
      fieldContext,
      required,
      answerType,
    };
  }

  /**
   * Post-process answer based on field type
   */
  postProcessAnswer(answer, fieldType) {
    if (!answer) return answer;

    switch (fieldType) {
      case "salary":
        return this.extractNumericSalary(answer);

      case "number":
        return this.extractNumericValue(answer);

      case "date":
        return this.formatDate(answer, "MM/DD/YYYY");

      case "phone":
        return this.formatPhoneNumber(answer);

      case "email":
        return this.validateEmail(answer) ? answer : null;

      case "text":
      case "textarea":
        return String(answer);

      default:
        return answer;
    }
  }

  /**
   * Post-processing helper methods
   */
  extractNumericSalary(answer) {
    if (!answer) return null;
    const cleaned = String(answer).replace(/[$,\s]/g, "").replace(/[^\d.]/g, " ");
    const match = cleaned.match(/\d+\.?\d*/);
    if (match) {
      const number = parseFloat(match[0]);
      if (!isNaN(number) && number > 0) {
        return Math.round(number).toString();
      }
    }
    return null;
  }

  extractNumericValue(answer) {
    if (!answer) return null;
    const match = String(answer).match(/\d+/);
    return match ? match[0] : answer;
  }

  formatDate(answer, format = "MM/DD/YYYY") {
    if (!answer) return answer;

    try {
      // Handle common date variations that AI might provide
      const dateStr = String(answer).toLowerCase();
      let targetDate;

      // Handle relative dates like "2 months ago", "1 year ago", etc.
      if (
        dateStr.includes("month") ||
        dateStr.includes("year") ||
        dateStr.includes("ago")
      ) {
        const now = new Date();
        targetDate = new Date(now);

        // Extract number from the string
        const numberMatch = dateStr.match(/(\d+)/);
        const number = numberMatch ? parseInt(numberMatch[1]) : 0;

        if (dateStr.includes("month")) {
          targetDate.setMonth(targetDate.getMonth() - number);
        } else if (dateStr.includes("year")) {
          targetDate.setFullYear(targetDate.getFullYear() - number);
        }
      } else {
        // Try to parse as a regular date
        targetDate = new Date(answer);
        if (isNaN(targetDate.getTime())) {
          // If we can't parse it, return the original answer
          return answer;
        }
      }

      // Format according to the specified format
      if (format === "MM/DD/YYYY") {
        const month = String(targetDate.getMonth() + 1).padStart(2, "0");
        const day = String(targetDate.getDate()).padStart(2, "0");
        const year = targetDate.getFullYear();
        return `${month}/${day}/${year}`;
      } else {
        // Default to yyyy-MM-dd format for other cases
        return targetDate.toISOString().split("T")[0];
      }
    } catch (error) {
      console.warn("Error formatting date:", error);
      return answer; // Return original if parsing fails
    }
  }

  formatPhoneNumber(answer) {
    return answer; // Let the specialized endpoint handle phone formatting
  }

  validateEmail(answer) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answer);
  }

  buildCacheKey(question, options, context) {
    return JSON.stringify({
      question,
      options: [...options].sort(),
      fieldType: context.fieldType,
      platform: context.platform,
    });
  }

  /**
   * Clear the answer cache
   */
  clearCache() {
    this.answerCache.clear();
  }
}
