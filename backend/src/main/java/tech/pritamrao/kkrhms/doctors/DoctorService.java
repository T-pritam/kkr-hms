package tech.pritamrao.kkrhms.doctors;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tech.pritamrao.kkrhms.common.ApiException;

import java.util.List;
import java.util.UUID;

@Service
public class DoctorService {

    private final DoctorRepository repository;

    public DoctorService(DoctorRepository repository) {
        this.repository = repository;
    }

    public Page<Doctor> list(int page, int pageSize, String search) {
        return repository.search(search, PageRequest.of(Math.max(page - 1, 0), pageSize));
    }

    public List<DoctorDtos.DoctorOption> all() {
        return repository.findAllByOrderByNameAsc().stream()
                .map(d -> new DoctorDtos.DoctorOption(d.getId(), d.getName(), d.getSpecialist()))
                .toList();
    }

    public Doctor get(UUID id) {
        return repository.findById(id).orElseThrow(() -> ApiException.notFound("Doctor not found"));
    }

    @Transactional
    public void create(DoctorDtos.DoctorRequest req) {
        if (req.name() == null || req.name().isBlank()) {
            throw ApiException.badRequest("Name is required");
        }
        Doctor doctor = new Doctor();
        apply(doctor, req);
        repository.save(doctor);
    }

    @Transactional
    public void update(UUID id, DoctorDtos.DoctorRequest req) {
        if (req.name() == null || req.name().isBlank()) {
            throw ApiException.badRequest("Name is required");
        }
        Doctor doctor = get(id);
        apply(doctor, req);
        repository.save(doctor);
    }

    @Transactional
    public void delete(UUID id) {
        repository.deleteById(id);
    }

    private void apply(Doctor doctor, DoctorDtos.DoctorRequest req) {
        doctor.setName(req.name());
        doctor.setMobile(req.mobile());
        doctor.setEmail(req.email());
        doctor.setDesignation(req.designation());
        doctor.setSpecialist(req.specialist());
    }
}
