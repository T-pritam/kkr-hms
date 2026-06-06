package tech.pritamrao.kkrhms.doctors;

import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Shared clinical data — readable/writable by any authenticated role. */
@RestController
@RequestMapping("/doctors")
public class DoctorController {

    private final DoctorService service;

    public DoctorController(DoctorService service) {
        this.service = service;
    }

    @GetMapping
    public Map<String, Object> list(@RequestParam(defaultValue = "1") int page,
                                    @RequestParam(defaultValue = "10") int pageSize,
                                    @RequestParam(defaultValue = "") String search) {
        Page<Doctor> result = service.list(page, pageSize, search);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("doctors", result.getContent().stream().map(DoctorDtos.DoctorView::of).toList());
        body.put("total", result.getTotalElements());
        body.put("page", page);
        body.put("pageSize", pageSize);
        body.put("totalPages", result.getTotalPages());
        return body;
    }

    @GetMapping("/all")
    public List<DoctorDtos.DoctorOption> all() {
        return service.all();
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable UUID id) {
        return Map.of("doctor", DoctorDtos.DoctorView.of(service.get(id)));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> create(@RequestBody DoctorDtos.DoctorRequest req) {
        service.create(req);
        return Map.of("message", "Doctor created successfully");
    }

    @PutMapping("/{id}")
    public Map<String, Object> update(@PathVariable UUID id, @RequestBody DoctorDtos.DoctorRequest req) {
        service.update(id, req);
        return Map.of("message", "Doctor updated successfully");
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable UUID id) {
        service.delete(id);
        return Map.of("message", "Doctor deleted successfully");
    }
}
