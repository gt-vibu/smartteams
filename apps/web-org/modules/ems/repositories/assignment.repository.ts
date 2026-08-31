import { emsStorageAdapter } from '../storage/storage.adapter';
import teamsFixture from '../data/fixtures/teams.json';
import projectsFixture from '../data/fixtures/projects.json';
import employeesFixture from '../data/fixtures/employees.json';

const STORAGE_KEY_TEAMS = 'ems_teams_list';
const STORAGE_KEY_PROJECTS = 'ems_projects_list';

export interface EmployeeProjectAssignment {
  projectId: string;
  role: string;
  allocationPercentage: number;
}

export interface EmployeeAssignmentState {
  teamIds: string[];
  projectAllocations: EmployeeProjectAssignment[];
}

export interface AssignmentTeamMember {
  id?: string;
  employeeId?: string;
  employeeNumber?: string;
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  joinedAt?: string;
  avatarInitials?: string;
  leftAt?: string | null;
}

export interface AssignmentTeam {
  id: string;
  name: string;
  branchName?: string;
  memberCount: number;
  teamLeadEmployeeId?: string;
  members: AssignmentTeamMember[];
}

export interface AssignmentProjectMember {
  id?: string;
  employeeId?: string;
  employeeNumber?: string;
  firstName?: string;
  lastName?: string;
  projectRole?: string;
  allocationPercentage?: string;
  startsOn?: string;
  endsOn?: string | null;
  avatarInitials?: string;
}

export interface AssignmentProject {
  id: string;
  code: string;
  name: string;
  members: AssignmentProjectMember[];
}

export class LocalAssignmentRepository {
  getTeams(): AssignmentTeam[] {
    return emsStorageAdapter.getItem(STORAGE_KEY_TEAMS, teamsFixture.teams);
  }

  getProjects(): AssignmentProject[] {
    return emsStorageAdapter.getItem(
      STORAGE_KEY_PROJECTS,
      projectsFixture.projects as AssignmentProject[],
    );
  }

  getAllEmployees() {
    return employeesFixture;
  }

  getEmployeeAssignments(employeeId: string, employeeNumber: string): EmployeeAssignmentState {
    const teams = this.getTeams();
    const projects = this.getProjects();

    const assignedTeamIds = teams
      .filter(
        (t) =>
          t.members.some(
            (m) =>
              (m.employeeId === employeeId || m.employeeNumber === employeeNumber) && !m.leftAt,
          ) || t.teamLeadEmployeeId === employeeId,
      )
      .map((t) => t.id);

    const projectAllocations: EmployeeProjectAssignment[] = [];
    projects.forEach((p) => {
      const member = p.members.find(
        (m) => m.employeeId === employeeId || m.employeeNumber === employeeNumber,
      );
      if (member) {
        projectAllocations.push({
          projectId: p.id,
          role: member.projectRole || 'Contributor',
          allocationPercentage: parseInt(member.allocationPercentage || '50', 10) || 50,
        });
      }
    });

    return {
      teamIds: assignedTeamIds,
      projectAllocations,
    };
  }

  saveEmployeeAssignments(
    employee: {
      id: string;
      employeeNumber: string;
      firstName: string;
      lastName: string;
      jobTitle: string;
    },
    teamIds: string[],
    projectAllocations: EmployeeProjectAssignment[],
  ) {
    const teams = this.getTeams();
    const projects = this.getProjects();

    // 1. Update Teams
    const updatedTeams = teams.map((team) => {
      const shouldBeMember = teamIds.includes(team.id);
      const existingMemberIndex = team.members.findIndex(
        (m) => m.employeeId === employee.id || m.employeeNumber === employee.employeeNumber,
      );

      const newMembers = [...team.members];

      if (shouldBeMember && existingMemberIndex === -1) {
        // Add member
        newMembers.push({
          id: `tm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          employeeId: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          employeeNumber: employee.employeeNumber,
          jobTitle: employee.jobTitle,
          joinedAt: new Date().toISOString().split('T')[0],
          leftAt: null,
          avatarInitials: `${employee.firstName[0]}${employee.lastName[0] || ''}`,
        });
      } else if (!shouldBeMember && existingMemberIndex !== -1) {
        // Remove member
        newMembers.splice(existingMemberIndex, 1);
      }

      return {
        ...team,
        members: newMembers,
        memberCount: newMembers.length,
      };
    });

    emsStorageAdapter.setItem(STORAGE_KEY_TEAMS, updatedTeams);

    // 2. Update Projects
    const updatedProjects = projects.map((proj) => {
      const alloc = projectAllocations.find((a) => a.projectId === proj.id);
      const existingMemberIndex = proj.members.findIndex(
        (m) => m.employeeId === employee.id || m.employeeNumber === employee.employeeNumber,
      );

      const newMembers = [...proj.members];

      if (alloc && existingMemberIndex === -1) {
        // Add project member
        newMembers.push({
          id: `pm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          employeeId: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          employeeNumber: employee.employeeNumber,
          projectRole: alloc.role || 'Contributor',
          allocationPercentage: `${alloc.allocationPercentage}%`,
          startsOn: new Date().toISOString().split('T')[0],
          endsOn: null,
          avatarInitials: `${employee.firstName[0]}${employee.lastName[0] || ''}`,
        });
      } else if (alloc && existingMemberIndex !== -1) {
        // Update existing member's role and allocation
        newMembers[existingMemberIndex] = {
          ...newMembers[existingMemberIndex],
          projectRole: alloc.role || 'Contributor',
          allocationPercentage: `${alloc.allocationPercentage}%`,
        };
      } else if (!alloc && existingMemberIndex !== -1) {
        // Remove member from project
        newMembers.splice(existingMemberIndex, 1);
      }

      return {
        ...proj,
        members: newMembers,
      };
    });

    emsStorageAdapter.setItem(STORAGE_KEY_PROJECTS, updatedProjects);

    // Notify listeners
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ems:storage:change'));
    }

    return {
      teams: updatedTeams,
      projects: updatedProjects,
    };
  }
}

export const assignmentRepository = new LocalAssignmentRepository();
