/**
 * Requirements Checker
 * 
 * Given a set of completed course codes and a requirements tree,
 * returns the satisfaction status of each requirement node.
 */

/**
 * Check if a single requirement node is satisfied
 * @param {Object} node - requirement node from requirements-filtered.json
 * @param {Set} completed - set of completed course codes e.g. new Set(['CO250', 'MATH239'])
 * @param {Set} planned - set of planned course codes
 * @returns {{ status: 'done'|'planned'|'partial'|'empty', satisfied: number, required: number }}
 */
export function checkNode(node, completed, planned) {
  switch (node.type) {

    case 'COURSE': {
      if (!node.code) return { status: 'empty', satisfied: 0, required: 1 }
      if (completed.has(node.code)) return { status: 'done', satisfied: 1, required: 1 }
      if (planned.has(node.code)) return { status: 'planned', satisfied: 1, required: 1 }
      return { status: 'empty', satisfied: 0, required: 1 }
    }

    case 'OR': {
      if (!node.children) return { status: 'empty', satisfied: 0, required: 1 }
      // satisfied if ANY child is done or planned
      const results = node.children.map(c => checkNode(c, completed, planned))
      const anyDone = results.some(r => r.status === 'done')
      const anyPlanned = results.some(r => r.status === 'planned')
      if (anyDone) return { status: 'done', satisfied: 1, required: 1 }
      if (anyPlanned) return { status: 'planned', satisfied: 1, required: 1 }
      return { status: 'empty', satisfied: 0, required: 1 }
    }

    case 'AND': {
      if (!node.children) return { status: 'empty', satisfied: 0, required: 1 }
      const results = node.children.map(c => checkNode(c, completed, planned))
      const allDone = results.every(r => r.status === 'done')
      const anyEmpty = results.some(r => r.status === 'empty')
      if (allDone) return { status: 'done', satisfied: results.length, required: results.length }
      if (anyEmpty) return { status: 'partial', satisfied: results.filter(r => r.status !== 'empty').length, required: results.length }
      return { status: 'planned', satisfied: results.length, required: results.length }
    }

    case 'N_OF': {
      if (!node.children) return { status: 'empty', satisfied: 0, required: node.n }
      const results = node.children.map(c => checkNode(c, completed, planned))
      const doneCount = results.filter(r => r.status === 'done').length
      const plannedCount = results.filter(r => r.status === 'planned').length
      const satisfiedCount = doneCount + plannedCount
      if (doneCount >= node.n) return { status: 'done', satisfied: doneCount, required: node.n }
      if (satisfiedCount >= node.n) return { status: 'planned', satisfied: satisfiedCount, required: node.n }
      if (satisfiedCount > 0) return { status: 'partial', satisfied: satisfiedCount, required: node.n }
      return { status: 'empty', satisfied: 0, required: node.n }
    }

    case 'ADDITIONAL': {
      // check how many completed/planned courses match the allowed subjects
      if (!node.subjects) return { status: 'empty', satisfied: 0, required: node.n || 1 }
      const required = node.n || 1
      const allCourses = [...completed, ...planned]
      const matching = allCourses.filter(code => {
        const subject = code.replace(/\d.*/, '') // e.g. "CO250" -> "CO"
        return node.subjects.includes(subject)
      })
      const doneMatching = [...completed].filter(code => {
        const subject = code.replace(/\d.*/, '')
        return node.subjects.includes(subject)
      }).length
      if (doneMatching >= required) return { status: 'done', satisfied: doneMatching, required }
      if (matching.length >= required) return { status: 'planned', satisfied: matching.length, required }
      if (matching.length > 0) return { status: 'partial', satisfied: matching.length, required }
      return { status: 'empty', satisfied: 0, required }
    }

    case 'CONCENTRATION': {
      // treat as info only for now
      return { status: 'empty', satisfied: 0, required: 1 }
    }

    default:
      return { status: 'empty', satisfied: 0, required: 1 }
  }
}

/**
 * Check all requirements for a program
 * @param {Object} program - program object from requirements-filtered.json
 * @param {string[]} completedCourses - array of completed course codes
 * @param {string[]} plannedCourses - array of planned course codes
 * @returns {Object} full requirement tree with status on each node
 */
export function checkProgram(program, completedCourses, plannedCourses) {
  const completed = new Set(completedCourses)
  const planned = new Set(plannedCourses)

  function annotate(node) {
    const result = checkNode(node, completed, planned)
    const annotated = { ...node, ...result }
    if (node.children) {
      annotated.children = node.children.map(c => annotate(c))
    }
    return annotated
  }

  const annotatedRequirements = program.requirements.map(r => annotate(r))

  // compute overall progress
  const topLevel = annotatedRequirements.map(r => checkNode(r, completed, planned))
  const totalRequired = topLevel.reduce((sum, r) => sum + r.required, 0)
  const totalSatisfied = topLevel.reduce((sum, r) => sum + r.satisfied, 0)
  const allDone = topLevel.every(r => r.status === 'done')

  return {
    programId: program.id,
    programName: program.name,
    requirements: annotatedRequirements,
    progress: {
      satisfied: totalSatisfied,
      required: totalRequired,
      percent: totalRequired > 0 ? Math.round((totalSatisfied / totalRequired) * 100) : 0,
      complete: allDone
    }
  }
}

/**
 * Find all requirement nodes that a specific course satisfies across a program
 * @param {string} courseCode - e.g. "CO250"
 * @param {Object} program - program from requirements-filtered.json
 * @returns {string[]} array of requirement descriptions this course satisfies
 */
export function findCourseSatisfies(courseCode, program) {
  const satisfied = []

  function search(node) {
    if (node.type === 'COURSE' && node.code === courseCode) {
      satisfied.push(node.text)
    }
    if (node.type === 'ADDITIONAL' && node.subjects) {
      const subject = courseCode.replace(/\d.*/, '')
      if (node.subjects.includes(subject)) {
        satisfied.push(node.text)
      }
    }
    if (node.children) {
      node.children.forEach(search)
    }
  }

  program.requirements.forEach(search)
  return satisfied
}