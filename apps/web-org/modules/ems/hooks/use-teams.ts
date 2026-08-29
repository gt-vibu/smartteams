'use client';

import { useState, useEffect, useCallback } from 'react';
import teamsFixture from '../data/fixtures/teams.json';
import { useEmployee } from './use-employee';
import { useAuth } from './use-auth';
import { emsStorageAdapter } from '../storage/storage.adapter';

export type TeamStatus = 'ACTIVE' | 'ARCHIVED';

export interface TeamMemberData {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  jobTitle: string;
  joinedAt: string;
  leftAt: string | null;
  avatarInitials: string;
}

export interface TeamData {
  id: string;
  name: string;
  description: string | null;
  status: TeamStatus;
  teamLeadEmployeeId: string | null;
  teamLead: {
    firstName: string;
    lastName: string;
    employeeNumber: string;
    jobTitle: string;
  } | null;
  branchName: string;
  memberCount: number;
  createdAt: string;
  members: TeamMemberData[];
}

const STORAGE_KEY_TEAMS = 'ems_teams_list';

export function useTeams() {
  const { employee } = useEmployee();
  const { persona } = useAuth();

  const [teams, setTeams] = useState<TeamData[]>(() => {
    return emsStorageAdapter.getItem<TeamData[]>(
      STORAGE_KEY_TEAMS,
      teamsFixture.teams as TeamData[],
    );
  });

  const refresh = useCallback(() => {
    setTimeout(() => {
      setTeams(
        emsStorageAdapter.getItem<TeamData[]>(STORAGE_KEY_TEAMS, teamsFixture.teams as TeamData[]),
      );
    }, 0);
  }, []);

  useEffect(() => {
    const handleStorageChange = () => refresh();
    window.addEventListener('ems:storage:change', handleStorageChange);
    window.addEventListener('ems:storage:reset', handleStorageChange);
    return () => {
      window.removeEventListener('ems:storage:change', handleStorageChange);
      window.removeEventListener('ems:storage:reset', handleStorageChange);
    };
  }, [refresh]);

  // Compute teams assigned to the currently logged in employee / persona
  const myAssignedTeams = teams.filter((t) => {
    // 1. Direct persona assignment mapping (if explicitly configured)
    if (persona?.assignedTeamIds && persona.assignedTeamIds.length > 0) {
      return persona.assignedTeamIds.includes(t.id);
    }

    // 2. Member roster matching for standard employees
    const isMember = t.members.some((m) => {
      if (m.leftAt) return false;
      const idMatch =
        (m.employeeId && employee?.id && m.employeeId === employee.id) ||
        (m.employeeId && persona?.user?.id && m.employeeId === persona.user.id) ||
        (m.employeeId && persona?.id && m.employeeId === persona.id);

      const numMatch =
        Boolean(
          m.employeeNumber &&
          employee?.employeeNumber &&
          m.employeeNumber === employee.employeeNumber,
        ) ||
        Boolean(
          m.employeeNumber &&
          persona?.employeeNumber &&
          m.employeeNumber === persona.employeeNumber,
        );

      const nameMatch = Boolean(
        employee?.firstName &&
        employee?.lastName &&
        m.firstName.toLowerCase() === employee.firstName.toLowerCase() &&
        m.lastName.toLowerCase() === employee.lastName.toLowerCase(),
      );

      return idMatch || (numMatch && nameMatch);
    });

    const isLead = Boolean(
      t.teamLeadEmployeeId &&
      (t.teamLeadEmployeeId === employee?.id ||
        t.teamLeadEmployeeId === persona?.user?.id ||
        t.teamLeadEmployeeId === persona?.id),
    );

    return isMember || isLead;
  });

  const isAssignedToTeam = myAssignedTeams.length > 0;
  const primaryTeam = myAssignedTeams[0] || null;

  const addTeam = useCallback((newTeam: TeamData) => {
    setTeams((prev) => {
      const updated = [newTeam, ...prev];
      emsStorageAdapter.setItem(STORAGE_KEY_TEAMS, updated);
      return updated;
    });
  }, []);

  return {
    teams,
    myAssignedTeams,
    isAssignedToTeam,
    primaryTeam,
    addTeam,
    refresh,
  };
}
