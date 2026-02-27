// core/url-builders.js
// Platform-specific URL builders with full job preference support

import {
  getIndeedJobURL,
  COUNTRY_CODES,
} from "../shared/utilities/url-resolver.js";

/**
 * Utility to get first element from array or return string value
 */
const getFirstOrString = (value) => {
  if (Array.isArray(value)) {
    return value.length > 0 ? value[value.length - 1] : null;
  }
  return value || null;
};

/**
 * URL Builders for each supported platform
 */
export const UrlBuilders = {
  greenhouse: (preferences) => {
    // Google site search approach (like Ashby)
    const location = getFirstOrString(preferences.location);
    const city = getFirstOrString(preferences.city);
    const workMode = getFirstOrString(preferences.workMode);

    // Build positions query with OR syntax for multiple keywords
    let positionsQuery = "";
    if (preferences.positions?.length) {
      const positions = Array.isArray(preferences.positions)
        ? preferences.positions
        : [preferences.positions];
      if (positions.length === 1) {
        positionsQuery = positions[0];
      } else {
        positionsQuery = `(${positions.join(" OR ")})`;
      }
    } else {
      positionsQuery = "software engineer";
    }

    // Build location/remote query
    let locationRemoteQuery = "";
    const isRemote = preferences.remoteOnly || workMode === "Remote";

    if (city && location && city !== location) {
      locationRemoteQuery = ` AND ${city} (${location})`;
    } else if (city) {
      locationRemoteQuery = ` AND ${city}`;
    } else if (isRemote && location) {
      locationRemoteQuery = ` AND Remote ${location}`;
    } else if (isRemote) {
      locationRemoteQuery = " AND Remote";
    } else if (location) {
      locationRemoteQuery = ` AND ${location}`;
    }

    const fullQuery = `site:job-boards.greenhouse.io AND ${positionsQuery}${locationRemoteQuery}`;
    return `https://www.google.com/search?q=${encodeURIComponent(fullQuery)}`;
  },

  /* ORIGINAL GREENHOUSE URL BUILDER (COMMENTED OUT)
  greenhouse: (preferences) => {
    const baseUrl = "https://my.greenhouse.io/jobs?";
    const params = new URLSearchParams();

    // Query/keywords (positions)
    if (preferences.positions?.length) {
      const keywords = Array.isArray(preferences.positions)
        ? preferences.positions.join(" ")
        : preferences.positions;
      params.append("query", keywords);
    }

    // Location
    const city = getFirstOrString(preferences.city);
    const location = getFirstOrString(preferences.location);
    if (city || location) {
      const locationParts = [];
      if (city) locationParts.push(city);
      if (location && location !== city) locationParts.push(location);
      params.append("location", locationParts.join(", "));
    }

    // Date posted - accepts both numeric values (1, 3, 7, 14, 30) or string values like "past_day"
    if (preferences.datePosted) {
      const dateMapping = {
        1: "past_day",
        3: "past_three_days",
        7: "past_week",
        14: "past_two_weeks",
        30: "past_thirty_days",
      };

      // Valid Greenhouse date filter values
      const validDateFilters = [
        "past_day",
        "past_three_days",
        "past_week",
        "past_two_weeks",
        "past_thirty_days",
      ];

      const dateValue = preferences.datePosted.toString();

      // Check if it's already a valid string value
      if (validDateFilters.includes(dateValue)) {
        params.append("date_posted", dateValue);
      } else {
        // Try to map from numeric value
        const dateFilter = dateMapping[dateValue];
        if (dateFilter) {
          params.append("date_posted", dateFilter);
        }
      }
    }

    // Salary
    // Greenhouse salary options: less_than_40k, more_than_40k, more_than_60k, more_than_80k,
    // more_than_100k, more_than_120k, more_than_140k, more_than_160k, more_than_180k, more_than_200k
    if (
      preferences.salary &&
      Array.isArray(preferences.salary) &&
      preferences.salary.length >= 1
    ) {
      const [minSalary] = preferences.salary;
      if (minSalary !== undefined && minSalary !== null) {
        // Salary buckets in descending order for matching
        const salaryBuckets = [
          { threshold: 200000, value: "more_than_200k" },
          { threshold: 180000, value: "more_than_180k" },
          { threshold: 160000, value: "more_than_160k" },
          { threshold: 140000, value: "more_than_140k" },
          { threshold: 120000, value: "more_than_120k" },
          { threshold: 100000, value: "more_than_100k" },
          { threshold: 80000, value: "more_than_80k" },
          { threshold: 60000, value: "more_than_60k" },
          { threshold: 40000, value: "more_than_40k" },
        ];

        let matched = false;
        for (const bucket of salaryBuckets) {
          if (minSalary >= bucket.threshold) {
            params.append("salary", bucket.value);
            matched = true;
            break;
          }
        }

        // If minSalary is less than 40k, use less_than_40k
        if (!matched && minSalary < 40000) {
          params.append("salary", "less_than_40k");
        }
      }
    }

    // Work mode / work type
    const workModes =
      preferences.workMode && preferences.workMode.length > 0
        ? preferences.workMode
        : preferences.remoteOnly
        ? ["Remote"]
        : [];

    if (workModes.length > 0) {
      const workTypeMap = {
        remote: "remote",
        hybrid: "hybrid",
        "on-site": "in_person",
        onsite: "in_person",
        "in-person": "in_person",
      };

      workModes.forEach((mode) => {
        const modeKey = mode.toLowerCase();
        if (workTypeMap[modeKey]) {
          params.append("work_type[]", workTypeMap[modeKey]);
        }
      });
    }

    // Job type / employment type
    if (preferences.jobType && preferences.jobType.length > 0) {
      const jobTypes = Array.isArray(preferences.jobType)
        ? preferences.jobType
        : [preferences.jobType];

      const employmentTypeMap = {
        "full-time": "full_time",
        "part-time": "part_time",
        contract: "contract",
        temporary: "temporary",
        internship: "internship",
      };

      jobTypes.forEach((type) => {
        const typeKey = type.toLowerCase();
        if (employmentTypeMap[typeKey]) {
          params.append("employment_type[]", employmentTypeMap[typeKey]);
        }
      });
    }

    return baseUrl + params.toString();
  },
  END OF ORIGINAL GREENHOUSE URL BUILDER */

  glassdoor: (preferences, country) => {
    const params = new URLSearchParams();

    params.set("applicationType", "1");
    if (preferences.remoteOnly === true) {
      params.set("remoteWorkType", "1");
    }

    if (
      preferences.salary &&
      Array.isArray(preferences.salary) &&
      preferences.salary.length === 2
    ) {
      const [minSalary, maxSalary] = preferences.salary;
      if (minSalary) {
        params.set("minSalary", minSalary.toString());
      }
      if (maxSalary) {
        params.set("maxSalary", maxSalary.toString());
      }
    }

    const companyRating = getFirstOrString(preferences.companyRating);
    if (companyRating && companyRating !== "Any rating") {
      const ratingMatch = companyRating.match(/(\d+(?:\.\d+)?)/);
      if (ratingMatch) {
        const rating = parseFloat(ratingMatch[1]);
        params.set("minRating", rating.toFixed(1));
      }
    }

    const datePosted = getFirstOrString(preferences.datePosted);
    const datePostedValue = datePosted?.label || datePosted;

    if (datePostedValue && datePostedValue !== "Any time") {
      params.set("fromAge", datePostedValue);
    }

    const jobTypeMap = {
      "Full-time": "CF3CP",
      "Fixed term contract": "T9BXE",
      Temporary: "4HKF7",
      Permanent: "5QWDV",
    };

    const jobType = getFirstOrString(preferences.jobType);
    if (jobType && jobTypeMap[jobType]) {
      params.set("jobTypeIndeed", jobTypeMap[jobType]);
    }

    const experience = getFirstOrString(preferences.experienceLevel);
    if (
      experience &&
      experience.trim() !== "" &&
      experience !== "Any experience"
    ) {
      const experienceMap = {
        entrylevel: "entrylevel",
        midseniorlevel: "midseniorlevel",
        internship: "internship",
        director: "director",
        executive: "executive",
      };

      const glassdoorExperience = experienceMap[experience];
      if (glassdoorExperience) {
        params.set("seniorityType", glassdoorExperience);
      }
    }

    const firstCity = getFirstOrString(preferences.city);
    const firstLocation = getFirstOrString(preferences.location);
    const firstPosition = getFirstOrString(preferences.positions);

    const GLASSDOOR_COUNTRY_ABBR = {
      "United States": "us",
      "United Kingdom": "uk",
      Canada: "ca",
      Australia: "au",
      Germany: "de",
      France: "fr",
      Netherlands: "nl",
      India: "in",
      Singapore: "sg",
      Nigeria: "ng",
      "South Africa": "za",
      Ireland: "ie",
      "New Zealand": "nz",
      Spain: "es",
      Italy: "it",
      Japan: "jp",
      Brazil: "br",
      Mexico: "mx",
      Switzerland: "ch",
      Belgium: "be",
      Austria: "at",
      Sweden: "se",
      Norway: "no",
      Denmark: "dk",
      Poland: "pl",
      "United Arab Emirates": "ae",
      "Hong Kong": "hk",
      Malaysia: "my",
      Philippines: "ph",
    };

    let baseUrl = "https://www.glassdoor.com/Job/jobs.htm";

    if (firstPosition && (firstCity || firstLocation)) {
      let locationSlug;

      if (firstCity) {
        const citySlug = firstCity
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "");
        const countryAbbr = firstLocation
          ? GLASSDOOR_COUNTRY_ABBR[firstLocation]
          : null;
        locationSlug = countryAbbr ? `${citySlug}-${countryAbbr}` : citySlug;
      } else {
        locationSlug = firstLocation
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "");
      }

      const positionSlug = firstPosition
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");

      const countryCode = COUNTRY_CODES?.[firstLocation] || "IN1";
      const locationLength = locationSlug.length;
      const positionStart = locationLength + 1;
      const positionEnd = positionStart + positionSlug.length;

      baseUrl = `https://www.glassdoor.com/Job/${locationSlug}-${positionSlug}-jobs-SRCH_IL.0,${locationLength}_${countryCode}_KO${positionStart},${positionEnd}.htm`;
    }

    return `${baseUrl}?${params.toString()}`;
  },

  indeed: (preferences, country) => {
    const params = new URLSearchParams();

    const pick = (v) => {
      if (!v) return null;
      if (Array.isArray(v)) return pick(v[0]);
      if (typeof v === "object")
        return (v.label || v.value || "").trim() || null;
      return String(v).trim() || null;
    };

    const position = pick(preferences.positions);
    if (position) params.set("q", position);

    const location = pick(preferences.city) || pick(preferences.location);
    if (location) params.set("l", location);

    const dateFrom = pick(preferences.datePosted);
    if (dateFrom) params.set("fromage", dateFrom);

    params.set("sort", "date");

    const SC_CHIPS = {
      workMode: {
        remote: "DSQF7",
        "hybrid work": "PAXZC",
      },
      jobType: {
        "full-time": "CF3CP",
        "part-time": "5QWDV",
        permanent: "5QWDV",
        freelance: "ZG59D",
        "fixed term contract": "T9BXE",
        casual: "CJWTS",
        temporary: "4HKF7",
        "internship / co-op": "VDTG7",
        "zero hours contract": "YM5JG",
        graduate: "7EQCZ",
        "temp to perm": "7SBAT",
        contract: "NJXCK",
        apprenticeship: "QADT5",
      },
    };

    const chipIds = [];

    const workMode = pick(preferences.workMode)?.toLowerCase();
    if (preferences.remoteOnly === true) {
      chipIds.push("DSQF7");
    } else if (SC_CHIPS.workMode[workMode]) {
      chipIds.push(SC_CHIPS.workMode[workMode]);
    }

    const jobType = pick(preferences.jobType)?.toLowerCase();
    if (jobType && SC_CHIPS.jobType[jobType]) {
      chipIds.push(SC_CHIPS.jobType[jobType]);
    }

    if (chipIds.length > 0) {
      const first = `0kf:attr(${chipIds[0]})`;
      const rest = chipIds
        .slice(1)
        .map((id) => `attr(${id})`)
        .join("");
      params.set("sc", `${first}${rest};`);
    }

    // Use getIndeedJobURL if available, otherwise default to .com
    const locationForUrl = pick(preferences.location) || pick(preferences.city);
    const baseUrl =
      typeof getIndeedJobURL === "function" && locationForUrl
        ? getIndeedJobURL(locationForUrl) || "https://www.indeed.com"
        : "https://www.indeed.com";

    return `${baseUrl}/jobs?${params.toString()}`;
  },

  lever: (preferences) => {
    const location = getFirstOrString(preferences.location);
    const city = getFirstOrString(preferences.city);
    const workMode = getFirstOrString(preferences.workMode);

    // Build positions query with OR syntax for multiple keywords
    let positionsQuery = "";
    if (preferences.positions?.length) {
      const positions = Array.isArray(preferences.positions)
        ? preferences.positions
        : [preferences.positions];
      if (positions.length === 1) {
        positionsQuery = positions[0];
      } else {
        positionsQuery = `(${positions.join(" OR ")})`;
      }
    } else {
      positionsQuery = "software engineer";
    }

    // Build location/remote query
    let locationRemoteQuery = "";
    const isRemote = preferences.remoteOnly || workMode === "Remote";

    if (city && location && city !== location) {
      locationRemoteQuery = ` AND ${city} (${location})`;
    } else if (city) {
      locationRemoteQuery = ` AND ${city}`;
    } else if (isRemote && location) {
      locationRemoteQuery = ` AND Remote ${location}`;
    } else if (isRemote) {
      locationRemoteQuery = " AND Remote";
    } else if (location) {
      locationRemoteQuery = ` AND ${location}`;
    }

    const fullQuery = `site:jobs.lever.co AND ${positionsQuery}${locationRemoteQuery}`;
    return `https://www.google.com/search?q=${encodeURIComponent(fullQuery)}`;
  },

  recruitee: (preferences) => {
    const location = getFirstOrString(preferences.location);
    const city = getFirstOrString(preferences.city);
    const workMode = getFirstOrString(preferences.workMode);

    // Build positions query with OR syntax for multiple keywords
    let positionsQuery = "";
    if (preferences.positions?.length) {
      const positions = Array.isArray(preferences.positions)
        ? preferences.positions
        : [preferences.positions];
      if (positions.length === 1) {
        positionsQuery = positions[0];
      } else {
        positionsQuery = `(${positions.join(" OR ")})`;
      }
    } else {
      positionsQuery = "software engineer";
    }

    // Build location/remote query
    let locationRemoteQuery = "";
    const isRemote = preferences.remoteOnly || workMode === "Remote";

    if (city && location && city !== location) {
      locationRemoteQuery = ` AND ${city} (${location})`;
    } else if (city) {
      locationRemoteQuery = ` AND ${city}`;
    } else if (isRemote && location) {
      locationRemoteQuery = ` AND Remote ${location}`;
    } else if (isRemote) {
      locationRemoteQuery = " AND Remote";
    } else if (location) {
      locationRemoteQuery = ` AND ${location}`;
    }

    const fullQuery = `site:recruitee.com AND ${positionsQuery}${locationRemoteQuery}`;
    return `https://www.google.com/search?q=${encodeURIComponent(fullQuery)}`;
  },

  workable: (preferences) => {
    const location = getFirstOrString(preferences.location);
    const city = getFirstOrString(preferences.city);
    const workMode = getFirstOrString(preferences.workMode);

    // Build positions query with OR syntax for multiple keywords
    let positionsQuery = "";
    if (preferences.positions?.length) {
      const positions = Array.isArray(preferences.positions)
        ? preferences.positions
        : [preferences.positions];
      if (positions.length === 1) {
        positionsQuery = positions[0];
      } else {
        positionsQuery = `(${positions.join(" OR ")})`;
      }
    } else {
      positionsQuery = "software engineer";
    }

    // Build location/remote query
    let locationRemoteQuery = "";
    const isRemote = preferences.remoteOnly || workMode === "Remote";

    if (city && location && city !== location) {
      locationRemoteQuery = ` AND ${city} (${location})`;
    } else if (city) {
      locationRemoteQuery = ` AND ${city}`;
    } else if (isRemote && location) {
      locationRemoteQuery = ` AND Remote ${location}`;
    } else if (isRemote) {
      locationRemoteQuery = " AND Remote";
    } else if (location) {
      locationRemoteQuery = ` AND ${location}`;
    }



    const fullQuery = `(site:jobs.workable.com OR site:apply.workable.com) AND ${positionsQuery}${locationRemoteQuery}`;
    return `https://www.google.com/search?q=${encodeURIComponent(fullQuery)}`;
  },

  ashby: (preferences) => {
    const location = getFirstOrString(preferences.location);
    const city = getFirstOrString(preferences.city);
    const workMode = getFirstOrString(preferences.workMode);

    // Build positions query with OR syntax for multiple keywords
    let positionsQuery = "";
    if (preferences.positions?.length) {
      const positions = Array.isArray(preferences.positions)
        ? preferences.positions
        : [preferences.positions];
      if (positions.length === 1) {
        positionsQuery = positions[0];
      } else {
        positionsQuery = `(${positions.join(" OR ")})`;
      }
    } else {
      positionsQuery = "software engineer";
    }

    // Build location/remote query
    let locationRemoteQuery = "";
    const isRemote = preferences.remoteOnly || workMode === "Remote";

    if (city && location && city !== location) {
      locationRemoteQuery = ` AND ${city} (${location})`;
    } else if (city) {
      locationRemoteQuery = ` AND ${city}`;
    } else if (isRemote && location) {
      locationRemoteQuery = ` AND Remote ${location}`;
    } else if (isRemote) {
      locationRemoteQuery = " AND Remote";
    } else if (location) {
      locationRemoteQuery = ` AND ${location}`;
    }

    const fullQuery = `site:jobs.ashbyhq.com AND ${positionsQuery}${locationRemoteQuery}`;
    return `https://www.google.com/search?q=${encodeURIComponent(fullQuery)}`;
  },

  breezy: (preferences) => {
    const location = getFirstOrString(preferences.location);
    const city = getFirstOrString(preferences.city);
    const workMode = getFirstOrString(preferences.workMode);

    // Build positions query with OR syntax for multiple keywords
    let positionsQuery = "";
    if (preferences.positions?.length) {
      const positions = Array.isArray(preferences.positions)
        ? preferences.positions
        : [preferences.positions];
      if (positions.length === 1) {
        positionsQuery = positions[0];
      } else {
        positionsQuery = `(${positions.join(" OR ")})`;
      }
    } else {
      positionsQuery = "software engineer";
    }

    // Build location/remote query
    let locationRemoteQuery = "";
    const isRemote = preferences.remoteOnly || workMode === "Remote";
    const isRemoteAnywhere = location?.toLowerCase() === "remote anywhere";

    if (isRemoteAnywhere) {
      locationRemoteQuery = " AND Remote (any location)";
    } else if (city && location && city !== location) {
      locationRemoteQuery = ` AND ${city} (${location})`;
    } else if (city) {
      locationRemoteQuery = ` AND ${city}`;
    } else if (isRemote && location) {
      locationRemoteQuery = ` AND Remote ${location}`;
    } else if (isRemote) {
      locationRemoteQuery = " AND Remote";
    } else if (location) {
      locationRemoteQuery = ` AND ${location}`;
    }

    const fullQuery = `site:breezy.hr AND ${positionsQuery}${locationRemoteQuery}`;
    return `https://www.google.com/search?q=${encodeURIComponent(fullQuery)}`;
  },

  linkedin: (preferences, country) => {
    const baseUrl = "https://www.linkedin.com/jobs/search/?";
    const joinWithOR = (arr) => (arr ? arr.join(" OR ") : "");
    const params = new URLSearchParams();

    // NOTE: Easy Apply filter (f_AL) removed to allow processing of ALL jobs
    // External apply jobs will be routed through UniversalJobRouter

    params.append("f_AL", true);
    
    // Handle positions
    if (preferences.positions?.length) {
      params.append("keywords", joinWithOR(preferences.positions));
    }

    const city = getFirstOrString(preferences.city);
    const countryFromPrefs = getFirstOrString(preferences.location);

    // Handle remote work
    if (preferences.location === "Remote") {
      params.append("f_WT", "2");
    } else {
      // Form location string
      let locationValue = "";
      if (city && countryFromPrefs) {
        locationValue = `${city}, ${countryFromPrefs}`;
      } else if (city) {
        locationValue = city;
      } else if (countryFromPrefs) {
        locationValue = countryFromPrefs;
      }

      params.append("location", locationValue);
    }

    const workModeMap = {
      Remote: "2",
      Hybrid: "3",
      "On-site": "1",
    };

    if (preferences.workMode?.length) {
      const workModeCodes = preferences.workMode
        .map((mode) => workModeMap[mode])
        .filter(Boolean);
      if (workModeCodes.length) {
        params.append("f_WT", workModeCodes.join(","));
      }
    }

    const datePostedMap = {
      "Any time": "",
      "Past month": "r2592000",
      "Past week": "r604800",
      "Past 24 hours": "r86400",
      "Few Minutes Ago": "r3600",
    };

    if (preferences.datePosted) {
      const dateCode = datePostedMap[preferences.datePosted];
      if (dateCode) {
        params.append("f_TPR", dateCode);
      }
    }

    const experienceLevelMap = {
      Internship: "1",
      "Entry level": "2",
      Associate: "3",
      "Mid-Senior level": "4",
      Director: "5",
      Executive: "6",
    };

    if (preferences.experience?.length) {
      const experienceCodes = preferences.experience
        .map((level) => experienceLevelMap[level])
        .filter(Boolean);
      if (experienceCodes.length) {
        params.append("f_E", experienceCodes.join(","));
      }
    }

    // Job Type Mapping
    const jobTypeMap = {
      "Full-time": "F",
      "Part-time": "P",
      Contract: "C",
      Temporary: "T",
      Internship: "I",
      Volunteer: "V",
    };

    if (preferences.jobType?.length) {
      const jobTypeCodes = preferences.jobType
        .map((type) => jobTypeMap[type])
        .filter(Boolean);
      if (jobTypeCodes.length) {
        params.append("f_JT", jobTypeCodes.join(","));
      }
    }

    // Salary Range Mapping
    if (preferences.salary?.length === 2) {
      const [min] = preferences.salary;
      const salaryBuckets = {
        40000: "1",
        60000: "2",
        80000: "3",
        100000: "4",
        120000: "5",
        140000: "6",
        160000: "7",
        180000: "8",
        200000: "9",
      };

      const bucketValue = Object.entries(salaryBuckets)
        .reverse()
        .find(([threshold]) => min >= parseInt(threshold))?.[1];

      if (bucketValue) {
        params.append("f_SB", bucketValue);
      }
    }

    // Sorting
    params.append("sortBy", "R");

    return baseUrl + params.toString();
  },

  wellfound: (preferences) => {
    return "https://wellfound.com/jobs";
  },

  workday: (preferences) => {
    const location = getFirstOrString(preferences.location);
    const city = getFirstOrString(preferences.city);
    const workMode = getFirstOrString(preferences.workMode);

    // Build positions query with OR syntax for multiple keywords
    let positionsQuery = "";
    if (preferences.positions?.length) {
      const positions = Array.isArray(preferences.positions)
        ? preferences.positions
        : [preferences.positions];
      if (positions.length === 1) {
        positionsQuery = positions[0];
      } else {
        positionsQuery = `(${positions.join(" OR ")})`;
      }
    } else {
      positionsQuery = "software engineer";
    }

    // Build location/remote query
    let locationRemoteQuery = "";
    const isRemote = preferences.remoteOnly || workMode === "Remote";

    if (city && location && city !== location) {
      locationRemoteQuery = ` AND ${city} (${location})`;
    } else if (city) {
      locationRemoteQuery = ` AND ${city}`;
    } else if (isRemote && location) {
      locationRemoteQuery = ` AND Remote ${location}`;
    } else if (isRemote) {
      locationRemoteQuery = " AND Remote";
    } else if (location) {
      locationRemoteQuery = ` AND ${location}`;
    }

    const fullQuery = `site:myworkdayjobs.com AND ${positionsQuery}${locationRemoteQuery}`;
    return `https://www.google.com/search?q=${encodeURIComponent(fullQuery)}`;
  },

  ziprecruiter: (preferences) => {
    const params = new URLSearchParams();

    const keywords = getFirstOrString(preferences.positions);
    if (keywords) {
      params.set("search", keywords);
    }

    const city = getFirstOrString(preferences.city);
    let location = city || getFirstOrString(preferences.location);

    if (preferences.remoteOnly === true) {
      params.set("refine_by_location_type", "only_remote");
    }

    if (location) {
      params.set("location", location);
    }

    const datePosted = getFirstOrString(preferences.datePosted);
    const datePostedValue = datePosted?.value || datePosted;
    if (datePostedValue) {
      params.set("days", datePostedValue);
    }

    const jobType = getFirstOrString(preferences.jobType);
    const jobTypeMap = {
      "Full-time": "full_time",
      "Part-time": "part_time",
      Contract: "contract",
      Temporary: "temp",
      Internship: "internship",
    };

    if (jobType && jobTypeMap[jobType]) {
      params.set(
        "refine_by_employment",
        `employment_type:${jobTypeMap[jobType]}`,
      );
    }

    if (
      preferences.salary &&
      Array.isArray(preferences.salary) &&
      preferences.salary.length >= 1
    ) {
      const [minSalary, maxSalary] = preferences.salary;

      if (minSalary && minSalary > 0) {
        params.set("refine_by_salary", minSalary.toString());
      }

      if (maxSalary && maxSalary > 0) {
        params.set("refine_by_salary_ceil", maxSalary.toString());
      } else {
        params.set("refine_by_salary_ceil", "");
      }
    }

    return `https://www.ziprecruiter.com/jobs-search?${params.toString()}`;
  },

  dice: (preferences) => {
    const baseUrl = "https://www.dice.com/jobs?";
    const params = new URLSearchParams();

    // NOTE: Easy Apply filter removed to allow processing of ALL jobs
    // External apply jobs will be routed through UniversalJobRouter

    // Posted date filter
    if (preferences.datePosted) {
      const dateMapping = {
        1: "ONE",
        3: "THREE",
        7: "SEVEN",
      };
      const diceDate = dateMapping[preferences.datePosted.toString()];
      if (diceDate) {
        params.append("filters.postedDate", diceDate);
      }
    }

    // Employment type filters
    if (preferences.jobType && preferences.jobType.length > 0) {
      const employmentTypes = [];
      const typeMapping = {
        "full-time": "FULLTIME",
        "part-time": "PARTTIME",
        contract: "CONTRACTS",
        "third-party": "THIRD_PARTY",
      };

      const jobTypes = Array.isArray(preferences.jobType)
        ? preferences.jobType
        : [preferences.jobType];

      jobTypes.forEach((type) => {
        const diceType = typeMapping[type.toLowerCase()];
        if (diceType && !employmentTypes.includes(diceType)) {
          employmentTypes.push(diceType);
        }
      });

      if (employmentTypes.length > 0) {
        params.append("filters.employmentType", employmentTypes.join("|"));
      }
    }

    // Workplace types
    if (preferences.workMode && preferences.workMode.length > 0) {
      const workplaceTypes = [];
      const workplaceMapping = {
        remote: "Remote",
        hybrid: "Hybrid",
        "on-site": "On-Site",
        onsite: "On-Site",
      };

      const workModes = Array.isArray(preferences.workMode)
        ? preferences.workMode
        : [preferences.workMode];

      workModes.forEach((mode) => {
        const diceType = workplaceMapping[mode.toLowerCase()];
        if (diceType && !workplaceTypes.includes(diceType)) {
          workplaceTypes.push(diceType);
        }
      });

      if (workplaceTypes.length > 0) {
        params.append("filters.workplaceTypes", workplaceTypes.join("|"));
      }
    }

    // Willing to sponsor filter
    if (preferences.willingToSponsor === true) {
      params.append("filters.willingToSponsor", "true");
    }

    // Search query (positions)
    if (preferences.positions?.length) {
      const keywords = Array.isArray(preferences.positions)
        ? preferences.positions.join(" ")
        : preferences.positions;
      params.append("q", keywords);
    } else {
      params.append("q", "software engineer");
    }

    // Location handling
    let locationString = "";
    if (preferences.city && preferences.location) {
      locationString = `${preferences.city}, ${preferences.location}`;
    } else if (preferences.city) {
      locationString = preferences.city;
    } else if (preferences.location) {
      locationString = preferences.location;
    }

    if (locationString) {
      params.append("location", locationString);
      params.append("countryCode", "US");
      params.append("locationPrecision", "City");
    } else {
      params.append("location", "United States");
      params.append("countryCode", "US");
    }

    return baseUrl + params.toString();
  },

  simplyhired: (preferences) => {
    const baseUrl = "https://www.simplyhired.com/search?";
    const params = new URLSearchParams();

    if (preferences.positions?.length) {
      const keywords = Array.isArray(preferences.positions)
        ? preferences.positions.join(" ")
        : preferences.positions;
      params.append("q", keywords);
    } else {
      params.append("q", "software engineer");
    }

    const jobTypeMap = {
      Internship: "VDTG7",
      "Full-time": "CF3CP",
      Contract: "NJXCK",
      Temporary: "4HKF7",
      "Part-time": "75GKK",
    };

    const jobType = getFirstOrString(preferences.jobType);
    if (jobType && jobTypeMap[jobType]) {
      params.set("jt", jobTypeMap[jobType]);
    }

    const city = getFirstOrString(preferences.city);
    let location = city || getFirstOrString(preferences.location);

    if (location) {
      params.append("l", location);
    } else {
      params.append("l", "Remote");
    }

    if (
      preferences.salary &&
      Array.isArray(preferences.salary) &&
      preferences.salary.length >= 1
    ) {
      const [minSalary] = preferences.salary;

      const salaryBuckets = [150000, 170000, 195000, 210000, 245000];
      let matchingSalary = null;
      for (let i = salaryBuckets.length - 1; i >= 0; i--) {
        if (salaryBuckets[i] <= minSalary) {
          matchingSalary = salaryBuckets[i];
          break;
        }
      }

      if (matchingSalary) {
        params.append("mip", matchingSalary.toString());
      }
    }

    params.append("job", "");

    if (preferences.datePosted) {
      params.append("t", preferences.datePosted);
    }

    return baseUrl + params.toString();
  },

  bayt: (preferences) => {
    // Get location for URL path - use country, default to "international"
    const locationRaw = preferences.location || preferences.country || "";
    const location = Array.isArray(locationRaw) ? locationRaw[0] : locationRaw;

    // Convert location to URL slug (e.g., "United Arab Emirates" -> "uae", "Saudi Arabia" -> "saudi-arabia")
    let locationSlug = "international";
    if (location) {
      // Common country mappings for Bayt
      const countryMappings = {
        "united arab emirates": "uae",
        uae: "uae",
        "saudi arabia": "saudi-arabia",
        ksa: "saudi-arabia",
        "united states": "usa",
        "united kingdom": "uk",
      };

      const locationLower = location.toLowerCase().trim();
      locationSlug =
        countryMappings[locationLower] || locationLower.replace(/\s+/g, "-");
    }

    // Get position for URL path (e.g., "Marketing Manager" -> "marketing-manager-jobs")
    let positionPath = "";
    if (preferences.positions?.length) {
      const position = Array.isArray(preferences.positions)
        ? preferences.positions[0]
        : preferences.positions;
      const positionSlug = position.toLowerCase().trim().replace(/\s+/g, "-");
      positionPath = `${positionSlug}-jobs/`;
    }

    const baseUrl = `https://www.bayt.com/en/${locationSlug}/jobs/${positionPath}`;
    const params = new URLSearchParams();

    // Always filter for external jobs (direct apply)
    params.append("options[jb_is_external_job][]", "1");

    return baseUrl + "?" + params.toString();
  },

  reed: (preferences) => {
    const baseUrl = "https://www.reed.co.uk/jobs/";
    const params = new URLSearchParams();

    // Job type prefix for URL path (e.g., full-time, part-time)
    let jobTypePrefix = "";
    const jobType = getFirstOrString(preferences.jobType);
    if (jobType) {
      const jobTypeMap = {
        "Full-time": "full-time",
        "full-time": "full-time",
        fulltime: "full-time",
        "Part-time": "part-time",
        "part-time": "part-time",
        parttime: "part-time",
        Contract: "contract",
        contract: "contract",
        Temporary: "temporary",
        temporary: "temporary",
        Permanent: "permanent",
        permanent: "permanent",
      };
      if (jobTypeMap[jobType]) {
        jobTypePrefix = jobTypeMap[jobType] + "-";
      }
    }

    // Keywords/positions - Reed uses path-based keywords
    let keywords = "";
    if (preferences.positions?.length) {
      keywords = Array.isArray(preferences.positions)
        ? preferences.positions.join("-")
        : preferences.positions;
      keywords = keywords.toLowerCase().replace(/\s+/g, "-");
    }

    // Location
    let location = "";
    const loc = getFirstOrString(preferences.location);
    if (loc) {
      location = loc.toLowerCase().replace(/\s+/g, "-");
    }

    // Date posted - pass the value directly as dateCreatedOffSet
    if (preferences.datePosted) {
      const dateValue =
        typeof preferences.datePosted === "string"
          ? preferences.datePosted
          : preferences.datePosted.toString();
      params.append("dateCreatedOffSet", dateValue);
    }

    // Salary range
    if (
      preferences.salary &&
      Array.isArray(preferences.salary) &&
      preferences.salary.length >= 1
    ) {
      const [minSalary, maxSalary] = preferences.salary;
      if (minSalary && minSalary > 0) {
        params.append("salaryFrom", minSalary.toString());
      }
      if (maxSalary && maxSalary > 0) {
        params.append("salaryTo", maxSalary.toString());
      }
    }

    // NOTE: Easy Apply filter removed to allow processing of ALL jobs
    // External apply jobs will be routed through UniversalJobRouter

    // Remote filter
    if (preferences.remoteOnly === true) {
      params.append("remoteworkingoption", "true");
    }

    // Build URL path: /jobs/{jobType}-{keyword}-jobs-in-{location}
    let url = baseUrl;
    if (jobTypePrefix || keywords) {
      url += `${jobTypePrefix}${keywords}-jobs`;
    }
    if (location) {
      url += `-in-${location}`;
    }

    const paramString = params.toString();
    if (paramString) {
      url += `?${paramString}`;
    }

    return url || "https://www.reed.co.uk/jobs";
  },

  smartrecruiters: (preferences) => {
    const location = getFirstOrString(preferences.location);
    const city = getFirstOrString(preferences.city);
    const workMode = getFirstOrString(preferences.workMode);

    // Build positions query with OR syntax for multiple keywords
    let positionsQuery = "";
    if (preferences.positions?.length) {
      const positions = Array.isArray(preferences.positions)
        ? preferences.positions
        : [preferences.positions];
      if (positions.length === 1) {
        positionsQuery = positions[0];
      } else {
        positionsQuery = `(${positions.join(" OR ")})`;
      }
    } else {
      positionsQuery = "software engineer";
    }

    // Build location/remote query
    let locationRemoteQuery = "";
    const isRemote = preferences.remoteOnly || workMode === "Remote";
    const isRemoteAnywhere = location?.toLowerCase() === "remote anywhere";

    if (isRemoteAnywhere) {
      locationRemoteQuery = " AND Work Remotely";
    } else if (city && location && city !== location) {
      locationRemoteQuery = ` AND ${city} (${location})`;
    } else if (city) {
      locationRemoteQuery = ` AND ${city}`;
    } else if (isRemote && location) {
      locationRemoteQuery = ` AND Remote ${location}`;
    } else if (isRemote) {
      locationRemoteQuery = " AND Remote";
    } else if (location) {
      locationRemoteQuery = ` AND ${location}`;
    }

    const fullQuery = `site:jobs.smartrecruiters.com AND ${positionsQuery}${locationRemoteQuery}`;
    return `https://www.google.com/search?q=${encodeURIComponent(fullQuery)}`;
  },

  jobvite: (preferences) => {
    const location = getFirstOrString(preferences.location);
    const city = getFirstOrString(preferences.city);
    const workMode = getFirstOrString(preferences.workMode);

    // Build positions query with OR syntax for multiple keywords
    let positionsQuery = "";
    if (preferences.positions?.length) {
      const positions = Array.isArray(preferences.positions)
        ? preferences.positions
        : [preferences.positions];
      if (positions.length === 1) {
        positionsQuery = positions[0];
      } else {
        positionsQuery = `(${positions.join(" OR ")})`;
      }
    } else {
      positionsQuery = "software engineer";
    }

    // Build location/remote query
    let locationRemoteQuery = "";
    const isRemote = preferences.remoteOnly || workMode === "Remote";

    if (city && location && city !== location) {
      locationRemoteQuery = ` AND ${city} (${location})`;
    } else if (city) {
      locationRemoteQuery = ` AND ${city}`;
    } else if (isRemote && location) {
      locationRemoteQuery = ` AND Remote ${location}`;
    } else if (isRemote) {
      locationRemoteQuery = " AND Remote";
    } else if (location) {
      locationRemoteQuery = ` AND ${location}`;
    }

    const fullQuery = `site:jobs.jobvite.com AND ${positionsQuery}${locationRemoteQuery}`;
    return `https://www.google.com/search?q=${encodeURIComponent(fullQuery)}`;
  },

  rippling: (preferences) => {
    const location = getFirstOrString(preferences.location);
    const city = getFirstOrString(preferences.city);
    const workMode = getFirstOrString(preferences.workMode);

    // Build positions query with OR syntax for multiple keywords
    let positionsQuery = "";
    if (preferences.positions?.length) {
      const positions = Array.isArray(preferences.positions)
        ? preferences.positions
        : [preferences.positions];
      if (positions.length === 1) {
        positionsQuery = positions[0];
      } else {
        positionsQuery = `(${positions.join(" OR ")})`;
      }
    } else {
      positionsQuery = "software engineer";
    }

    // Build location/remote query
    let locationRemoteQuery = "";
    const isRemote = preferences.remoteOnly || workMode === "Remote";

    if (city && location && city !== location) {
      locationRemoteQuery = ` AND ${city} (${location})`;
    } else if (city) {
      locationRemoteQuery = ` AND ${city}`;
    } else if (isRemote && location) {
      locationRemoteQuery = ` AND Remote ${location}`;
    } else if (isRemote) {
      locationRemoteQuery = " AND Remote";
    } else if (location) {
      locationRemoteQuery = ` AND ${location}`;
    }

    const fullQuery = `site:ats.rippling.com AND ${positionsQuery}${locationRemoteQuery}`;
    return `https://www.google.com/search?q=${encodeURIComponent(fullQuery)}`;
  },

  icims: (preferences) => {
    const location = getFirstOrString(preferences.location);
    const city = getFirstOrString(preferences.city);
    const workMode = getFirstOrString(preferences.workMode);

    // Build positions query with OR syntax for multiple keywords
    let positionsQuery = "";
    if (preferences.positions?.length) {
      const positions = Array.isArray(preferences.positions)
        ? preferences.positions
        : [preferences.positions];
      if (positions.length === 1) {
        positionsQuery = positions[0];
      } else {
        positionsQuery = `(${positions.join(" OR ")})`;
      }
    } else {
      positionsQuery = "software engineer";
    }

    // Build location/remote query
    let locationRemoteQuery = "";
    const isRemote = preferences.remoteOnly || workMode === "Remote";

    if (city && location && city !== location) {
      locationRemoteQuery = ` AND ${city} (${location})`;
    } else if (city) {
      locationRemoteQuery = ` AND ${city}`;
    } else if (isRemote && location) {
      locationRemoteQuery = ` AND Remote ${location}`;
    } else if (isRemote) {
      locationRemoteQuery = " AND Remote";
    } else if (location) {
      locationRemoteQuery = ` AND ${location}`;
    }

    const fullQuery = `site:icims.com AND ${positionsQuery}${locationRemoteQuery}`;
    return `https://www.google.com/search?q=${encodeURIComponent(fullQuery)}`;
  },

  monster: (preferences) => {
    const baseUrl = "https://www.monster.com/jobs/search";
    const params = new URLSearchParams();

    // Query/keywords (positions)
    if (preferences.positions?.length) {
      const keywords = Array.isArray(preferences.positions)
        ? preferences.positions.join(" ")
        : preferences.positions;
      params.append("q", keywords);
    } else {
      params.append("q", "software engineer");
    }

    // Location
    const city = getFirstOrString(preferences.city);
    const location = city || getFirstOrString(preferences.location);
    if (location) {
      params.append("where", location);
    }

    // Date posted (recency)
    // Monster uses: 1 = 24 hours, 3 = 3 days, 7 = week, 14 = 2 weeks, 30 = month
    if (preferences.datePosted) {
      const dateValue = preferences.datePosted.toString();
      params.append("recency", dateValue);
    }

    // Employment type
    // Monster uses: Full-Time, Part-Time, Contract, Temporary, Internship
    if (preferences.jobType && preferences.jobType.length > 0) {
      const jobTypes = Array.isArray(preferences.jobType)
        ? preferences.jobType
        : [preferences.jobType];

      const employmentTypeMap = {
        "full-time": "Full-Time",
        fulltime: "Full-Time",
        "part-time": "Part-Time",
        parttime: "Part-Time",
        contract: "Contract",
        temporary: "Temporary",
        internship: "Internship",
      };

      jobTypes.forEach((type) => {
        const typeKey = type.toLowerCase().trim();
        if (employmentTypeMap[typeKey]) {
          params.append("et", employmentTypeMap[typeKey]);
        }
      });
    }

    // Page (start at 1)
    params.append("page", "1");

    return `${baseUrl}?${params.toString()}`;
  },
};

/**
 * Build starting URL for a platform with full preferences support
 * @param {string} platform - Platform name
 * @param {Object} preferences - Job search preferences
 * @param {string} country - User's country (optional)
 * @returns {string} The constructed URL
 */
export function buildStartingUrl(platform, preferences = {}, country = null) {
  const builder = UrlBuilders[platform];

  if (builder) {
    return builder(preferences, country);
  }

  // Fallback for unknown platforms
  const position = getFirstOrString(preferences.positions);
  const keywords = position ? position + " jobs" : "software engineer jobs";
  const location = getFirstOrString(preferences.location);
  const locationStr = location && !preferences.remoteOnly ? ` ${location}` : "";

  return `https://www.google.com/search?q=${encodeURIComponent(
    keywords + locationStr,
  )}`;
}

export default { UrlBuilders, buildStartingUrl };
