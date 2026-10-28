export type AuthUser = {
  user_id: number;
  full_name: string;
  email: string;
  phone_number?: string | null;
  role: "student" | "sponsor" | "advisor" | "admin";
  profile_picture?: string | null;
  status?: string | null;
  created_at?: string;
};

export type LoginResponse = {
  message: string;
  user: AuthUser;
};

export type RegisterResponse = {
  message: string;
  user: AuthUser;
};
